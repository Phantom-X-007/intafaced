import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, scopedProcedure, serviceProcedure, TRPCError } from '@intafaced/contracts';
import { rankPerksSchema, rankStateSchema } from '@intafaced/contracts';
import { AuthError as GuardError, requireMfa } from '@intafaced/auth';
import { AuthError, type AuthService, type KycRecordView } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';

/**
 * svc-identity's API (§4.1).
 *
 * The contract shape lives in `packages/contracts` — this implements it. A
 * breaking change there is a compile error here, caught in the contracts PR
 * before any consumer is touched (§15.2).
 */

function toTrpcError(err: unknown): TRPCError {
  // A guard rejection (`requireMfa`) is not a server fault. It arrives as the
  // shared package's AuthError, which is a different class from this service's.
  if (err instanceof GuardError) {
    return new TRPCError({ code: err.code === 'mfa.required' ? 'UNAUTHORIZED' : 'FORBIDDEN', message: err.message, cause: err });
  }

  if (!(err instanceof AuthError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Request failed', cause: err });
  }

  switch (err.code) {
    case 'auth.invalid_credentials':
    case 'auth.mfa_invalid':
      // Deliberately the same shape as a wrong password: never confirm which
      // half of the credential was right.
      return new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials', cause: err });
    case 'auth.mfa_required':
      return new TRPCError({ code: 'UNAUTHORIZED', message: 'Two-factor code required', cause: err });
    case 'auth.mfa_not_enrolled':
      // FORBIDDEN, not UNAUTHORIZED: retrying with a code cannot help. The
      // client has to send the user through TOTP enrolment first, and the two
      // need different UI.
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    case 'auth.kyc_not_pending':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    case 'auth.session_invalid':
    case 'auth.session_reused':
      return new TRPCError({ code: 'UNAUTHORIZED', message: err.message, cause: err });
    case 'auth.handle_taken':
    case 'auth.email_taken':
    case 'auth.mfa_already_enrolled':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    case 'auth.account_frozen':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    case 'auth.not_found':
      return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
  }
}

const sessionOutput = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  userId: z.string().uuid(),
});

/** The tiers a user can ask for. `none` is the absence of a record, not a request. */
const submittableTier = z.enum(['basic', 'full', 'institutional']);

const kycRecordOutput = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tier: z.enum(['none', 'basic', 'full', 'institutional']),
  jurisdiction: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  reviewedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * What a KYC record looks like on the wire.
 *
 * `providerRef` and `reviewedBy` are deliberately absent. §10 PII isolation:
 * the provider pointer is an internal reference to a document store, and naming
 * the reviewing operator to the user under review is how a compliance officer
 * acquires a personal adversary. Both stay server-side.
 */
function presentKyc(record: KycRecordView) {
  return {
    id: record.id,
    userId: record.userId,
    tier: record.tier,
    jurisdiction: record.jurisdiction,
    status: record.status,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createIdentityRouter(auth: AuthService, rank: RankService, options: { registrationOpen: boolean }) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-identity') }))
      .query(() => ({ ok: true, service: 'svc-identity' as const })),

    auth: router({
      register: publicProcedure
        .input(
          z.object({
            handle: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/, 'handle must be 3-32 letters, numbers or underscores'),
            email: z.string().email(),
            password: z.string().min(12).max(200),
            region: z.string().length(2).optional(),
          }),
        )
        .output(sessionOutput)
        .mutation(async ({ input, ctx }) => {
          if (!options.registrationOpen) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration is not open yet' });
          }
          try {
            const session = await auth.register({ ...input, ip: ctx.requestId });
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      login: publicProcedure
        .input(z.object({ identifier: z.string().min(1), password: z.string().min(1), totpCode: z.string().optional() }))
        .output(sessionOutput)
        .mutation(async ({ input }) => {
          try {
            const session = await auth.login(input);
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      refresh: publicProcedure
        .input(z.object({ refreshToken: z.string().min(1) }))
        .output(sessionOutput)
        .mutation(async ({ input }) => {
          try {
            const session = await auth.refresh(input.refreshToken);
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      logout: publicProcedure
        .input(z.object({ refreshToken: z.string().min(1) }))
        .output(z.object({ ok: z.literal(true) }))
        .mutation(async ({ input }) => {
          await auth.logout(input.refreshToken);
          return { ok: true as const };
        }),

      logoutAll: protectedProcedure.output(z.object({ revoked: z.number() })).mutation(async ({ ctx }) => ({
        revoked: await auth.logoutAll(ctx.principal.userId),
      })),

      /**
       * THE STEP-UP CHALLENGE.
       *
       * `defaultScopes()` withholds `trade:withdraw` — "added only after a
       * step-up challenge" — and there was no step-up challenge anywhere in the
       * OS, which made every withdrawal surface unreachable by a real session.
       * This is that challenge: a live session plus a fresh TOTP code buys a
       * five-minute token that carries the scope.
       *
       * `protectedProcedure`, not `scopedProcedure`: the caller is proving a
       * second factor, not exercising a permission. Requiring a scope to ask for
       * a scope would only mean the answer was already yes.
       */
      stepUp: protectedProcedure
        .input(z.object({ totpCode: z.string().regex(/^\d{6}$/) }))
        .output(z.object({ accessToken: z.string(), expiresAt: z.string(), scopes: z.array(z.string()) }))
        .mutation(async ({ ctx, input }) => {
          try {
            const elevated = await auth.stepUp({
              userId: ctx.principal.userId,
              sessionId: ctx.principal.sid,
              totpCode: input.totpCode,
            });
            return { ...elevated, expiresAt: elevated.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
    }),

    totp: router({
      enrol: protectedProcedure
        .output(z.object({ secret: z.string(), uri: z.string(), recoveryCodes: z.array(z.string()) }))
        .mutation(async ({ ctx }) => {
          try {
            return await auth.startTotpEnrolment(ctx.principal.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      confirm: protectedProcedure
        .input(z.object({ secret: z.string().min(16), code: z.string().regex(/^\d{6}$/) }))
        .output(z.object({ ok: z.literal(true) }))
        .mutation(async ({ ctx, input }) => {
          try {
            await auth.confirmTotpEnrolment(ctx.principal.userId, input.secret, input.code);
            return { ok: true as const };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
    }),

    /**
     * KYC (§4.1 `kyc.start / kyc.webhook / kyc.status`).
     *
     * WHAT THIS GATES, AND WHAT IT DOES NOT. §22 — zero-KYC follows custody.
     * These procedures exist for the CUSTODIAL side: the ledger holds the asset,
     * so the jurisdiction matrix applies to it. Nothing here gates a
     * non-custodial surface, and nothing here should ever be made to: a Protocol
     * Plane module is `custodial: false`, `checkAccess` returns
     * `allowed.permissionless` for it before any tier is read, and that
     * short-circuit is the law as code (`packages/config/src/jurisdiction.ts`).
     *
     * There is no provider integration here on purpose. Approval is an OPERATOR
     * ACTION against `kyc_records` — a human decides, and the row records which
     * human. A provider webhook can be added later as one more way to move a
     * record from `pending`, without changing what approval means.
     */
    kyc: router({
      /**
       * A user asks to be verified. Grants nothing.
       *
       * There is no `userId` input, so there is no way to submit on somebody
       * else's behalf — the identity comes from the token and cannot be
       * overridden. An ownership check would be a check on a value the caller
       * supplies; not accepting the value is stronger.
       */
      submit: scopedProcedure('identity:write')
        .input(
          z.object({
            tier: submittableTier,
            /** ISO-3166 alpha-2. The matrix is keyed on it, so it is not free text. */
            jurisdiction: z.string().length(2).toUpperCase(),
            providerRef: z.string().min(1).max(200).optional(),
          }),
        )
        .output(kycRecordOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            return presentKyc(
              await auth.submitKyc({
                userId: ctx.principal.userId,
                tier: input.tier,
                jurisdiction: input.jurisdiction,
                ...(input.providerRef ? { providerRef: input.providerRef } : {}),
              }),
            );
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** The caller's own records, and the tier they currently add up to. */
      status: scopedProcedure('identity:read')
        .output(z.object({ tier: z.enum(['none', 'basic', 'full', 'institutional']), records: z.array(kycRecordOutput) }))
        .query(async ({ ctx }) => ({
          // Read from the same function the token issuer uses, rather than
          // re-deriving "highest approved, unexpired" here. Two implementations
          // of that rule would eventually disagree, and the one the user is
          // shown is not the one that decides what they can do.
          tier: await auth.kycTier(ctx.principal.userId),
          records: (await auth.listKycRecords(ctx.principal.userId)).map(presentKyc),
        })),

      /**
       * THE OPERATOR ACTION — THIS GRANTS TRADING ACCESS.
       *
       * `admin:compliance`, which no user session carries, plus an explicit
       * second-factor check.
       *
       * WHY `requireMfa` IS HERE AND NOT IMPLIED BY THE SCOPE.
       * `INTERACTIVE_ONLY_SCOPES` is what forces 2FA on a scope, and
       * `admin:compliance` is NOT in that list — its stated membership test is
       * "does this move value OFF the platform", and approving a record moves
       * nothing. But it is a privilege-escalation primitive: a leaked operator
       * key that can self-approve an account to `institutional` unlocks every
       * custodial module in the OS. So the second factor is enforced here,
       * locally, and the question of whether the shared list should grow is
       * argued in the PR rather than settled by editing a shared package inside
       * a service PR (§15.2).
       */
      approve: scopedProcedure('admin:compliance')
        .input(
          z.object({
            recordId: z.string().uuid(),
            /** When the verification lapses. Null means it does not. */
            expiresAt: z.string().datetime({ offset: true }).nullish(),
          }),
        )
        .output(kycRecordOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            return presentKyc(
              await auth.approveKycRecord({
                recordId: input.recordId,
                reviewerId: ctx.principal.userId,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
              }),
            );
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** The other half of a review. Grants nothing and announces nothing. */
      reject: scopedProcedure('admin:compliance')
        .input(z.object({ recordId: z.string().uuid() }))
        .output(kycRecordOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            return presentKyc(await auth.rejectKycRecord({ recordId: input.recordId, reviewerId: ctx.principal.userId }));
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** The review queue. Without it `approve` needs a record id nobody can find. */
      pending: scopedProcedure('admin:compliance')
        .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
        .output(z.array(kycRecordOutput))
        .query(async ({ input }) => (await auth.listPendingKyc(input?.limit ?? 50)).map(presentKyc)),
    }),

    rank: router({
      get: scopedProcedure('identity:read')
        .input(z.object({ userId: z.string().uuid() }))
        .output(rankStateSchema)
        .query(async ({ input }) => {
          const snapshot = await rank.get(input.userId);
          return {
            userId: snapshot.userId,
            rank: snapshot.rank,
            xp: snapshot.xp.toString(),
            seasonXp: snapshot.seasonXp.toString(),
            nextRankAt: snapshot.xpToNext?.toString() ?? null,
            updatedAt: snapshot.updatedAt.toISOString(),
          };
        }),

      /** The hot path — every module calls this. Cached in Redis in Phase 2. */
      perks: scopedProcedure('identity:read')
        .input(z.object({ userId: z.string().uuid() }))
        .output(rankPerksSchema)
        .query(({ input }) => rank.perks(input.userId)),

      /**
       * Service-to-service only. Modules award XP by calling this rather than by
       * writing rank_state — svc-identity is the only writer (§4.1).
       *
       * Was `publicProcedure`, then `scopedProcedure('identity:write')` after a
       * partner audit. That still failed closed the wrong way: every interactive
       * session receives `identity:write` via `defaultScopes()`, so any logged-in
       * user could mint XP (and therefore rank, fee discounts, P2P limits,
       * launchpad allocation) for any userId. `serviceProcedure` requires the
       * shared INTERNAL_SERVICE_SECRET HMAC — same bar as ledger.post (#50).
       *
       * Full audit L2-2 / L11-2, 2026-07-29.
       */
      awardXp: serviceProcedure
        .input(
          z.object({
            userId: z.string().uuid(),
            sourceModule: z.string().min(1),
            action: z.string().min(1),
            xpDelta: z.number().int(),
            idempotencyKey: z.string().min(8),
            meta: z.record(z.unknown()).optional(),
          }),
        )
        .output(z.object({ rank: z.number(), xp: z.string(), applied: z.boolean(), rankChanged: z.boolean() }))
        .mutation(async ({ input }) => {
          const result = await rank.awardXp(input);
          return {
            rank: result.snapshot.rank,
            xp: result.snapshot.xp.toString(),
            applied: result.applied,
            rankChanged: result.rankChanged,
          };
        }),
    }),

    apiKeys: router({
      create: scopedProcedure('identity:write')
        .input(
          z.object({
            name: z.string().min(1).max(64),
            scopes: z.array(z.string()).min(1),
            domainWhitelist: z.array(z.string()).optional(),
          }),
        )
        .output(z.object({ id: z.string(), key: z.string(), prefix: z.string() }))
        .mutation(async ({ ctx, input }) => {
          try {
            return await auth.createApiKey({ userId: ctx.principal.userId, ...input });
          } catch (err) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message, cause: err });
          }
        }),

      list: scopedProcedure('identity:read')
        .output(
          z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              prefix: z.string(),
              scopes: z.array(z.string()),
              lastUsedAt: z.string().nullable(),
              revoked: z.boolean(),
            }),
          ),
        )
        .query(async ({ ctx }) => {
          const keys = await auth.listApiKeys(ctx.principal.userId);
          return keys.map((k) => ({
            id: k.id,
            name: k.name,
            prefix: k.key_prefix,
            scopes: k.scopes,
            lastUsedAt: k.last_used_at?.toISOString() ?? null,
            revoked: k.revoked,
          }));
        }),

      revoke: scopedProcedure('identity:write')
        .input(z.object({ keyId: z.string().uuid() }))
        .output(z.object({ revoked: z.boolean() }))
        .mutation(async ({ ctx, input }) => ({ revoked: await auth.revokeApiKey(ctx.principal.userId, input.keyId) })),
    }),

    subAccounts: router({
      create: scopedProcedure('identity:write')
        .input(z.object({ label: z.string().min(1).max(64), purpose: z.string().max(200).optional() }))
        .output(z.object({ id: z.string().uuid() }))
        .mutation(({ ctx, input }) => auth.createSubAccount(ctx.principal.userId, input.label, input.purpose)),
    }),
  });
}

export type IdentityRouter = ReturnType<typeof createIdentityRouter>;
