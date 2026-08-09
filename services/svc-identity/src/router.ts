import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, scopedProcedure, serviceProcedure, TRPCError } from '@intafaced/contracts';
import { rankPerksSchema, rankStateSchema } from '@intafaced/contracts';
import { AuthError as GuardError, requireMfa } from '@intafaced/auth';
import { AuthError, type AuthService, type KycRecordView } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';
import {
  AffiliatePayoutRefuseError,
  affiliateFreezeHonestyLine,
  affiliateMemberListStatusLine,
  affiliateTreeStatusLine,
  refuseAffiliatePayout,
} from './affiliates/admin-tree-read.js';
import { ReferralError } from './affiliates/referral-tree.js';
import type { ReferralService } from './affiliates/referral-service.js';
import { FreezeError } from './affiliates/freeze-store.js';
import type { FreezeService } from './affiliates/freeze-service.js';
import { accrueCommission, CommissionError, type TierRate } from './affiliates/commission.js';
import {
  AccrualRateRefuseError,
  type AccrualTierLaw,
  resolveAccrualTiers,
  UNPUBLISHED_ACCRUAL_TIER_LAW,
} from './affiliates/commission-rate-law.js';
import { accrueWithFreezes } from './affiliates/freeze.js';
import type { AccrualStore } from './affiliates/accrual-store.js';

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

  if (err instanceof ReferralError) {
    switch (err.code) {
      case 'referral.unknown_referrer':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'referral.already_set':
      case 'referral.cycle':
      case 'referral.depth':
      case 'referral.self':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'referral.invalid':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }

  if (err instanceof FreezeError) {
    switch (err.code) {
      case 'freeze.not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'freeze.already':
      case 'freeze.not_frozen':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'freeze.invalid':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }

  if (err instanceof CommissionError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }

  if (err instanceof AccrualRateRefuseError) {
    // PRECONDITION_FAILED: operator asked to accrue before owner rates exist.
    // Same residual class as payout refuse — invent hole was accrual, not only payout.
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.message} [${err.residual}]`,
      cause: err,
    });
  }

  if (err instanceof AffiliatePayoutRefuseError) {
    // PRECONDITION_FAILED: operator asked for pay before owner rates + ledger recipe exist.
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.message} [${err.residual}]`,
      cause: err,
    });
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
    case 'auth.webauthn_not_enrolled':
      // FORBIDDEN, not UNAUTHORIZED: retrying with a code cannot help. The
      // client has to send the user through enrolment first, and the two
      // need different UI.
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    case 'auth.webauthn_invalid':
      return new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials', cause: err });
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
    case 'auth.sub_account_required':
    case 'auth.sub_account_same':
      return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    case 'auth.sub_account_denied':
    case 'auth.sub_account_revoked':
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
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

export function createIdentityRouter(
  auth: AuthService,
  rank: RankService,
  options: {
    registrationOpen: boolean;
    webauthnEnabled?: boolean;
    referral?: ReferralService;
    freeze?: FreezeService;
    /** Slice B durable accrual rows (no ledger). Optional for light tests. */
    accruals?: AccrualStore;
    /**
     * Owner-published commission tier law (DIRECTION §8).
     * Blank / unpublished → accrue refuses when the request omits tiers.
     * Default unpublished — never invent 10/5/2%.
     */
    accrualTierLaw?: AccrualTierLaw;
  },
) {
  const webauthnEnabled = options.webauthnEnabled !== false;
  const referral = options.referral;
  const freeze = options.freeze;
  const accruals = options.accruals;
  const accrualTierLaw = options.accrualTierLaw ?? UNPUBLISHED_ACCRUAL_TIER_LAW;

  function requireReferral(): ReferralService {
    if (!referral) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Referral tree is not configured' });
    }
    return referral;
  }

  function requireFreeze(): FreezeService {
    if (!freeze) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Affiliate freeze store is not configured' });
    }
    return freeze;
  }

  function requireAccruals(): AccrualStore {
    if (!accruals) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Affiliate accrual store is not configured' });
    }
    return accruals;
  }

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
       * This is that challenge: a live session plus a fresh TOTP code **or** a
       * WebAuthn assertion (after `stepUpOptions`) buys a five-minute token that
       * carries the scope. Passkey-only accounts can withdraw without TOTP theatre.
       *
       * `protectedProcedure`, not `scopedProcedure`: the caller is proving a
       * second factor, not exercising a permission. Requiring a scope to ask for
       * a scope would only mean the answer was already yes.
       */
      /**
       * WebAuthn options for step-up (passkey withdraw). Challenge kind is
       * `step-up` so a passwordless-login assertion cannot be reused here.
       */
      stepUpOptions: protectedProcedure.mutation(async ({ ctx }) => {
        if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
        try {
          return await auth.startWebauthnStepUp(ctx.principal.userId);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

      stepUp: protectedProcedure
        .input(
          z
            .object({
              totpCode: z
                .string()
                .regex(/^\d{6}$/)
                .optional(),
              webauthn: z
                .object({
                  id: z.string().min(1),
                  rawId: z.string().min(1),
                  type: z.literal('public-key'),
                  response: z.object({
                    clientDataJSON: z.string().min(1),
                    authenticatorData: z.string().min(1),
                    signature: z.string().min(1),
                    userHandle: z.string().nullish(),
                  }),
                  clientExtensionResults: z.record(z.unknown()).optional(),
                })
                .optional(),
            })
            .refine((v) => Boolean(v.totpCode) !== Boolean(v.webauthn), {
              message: 'Provide exactly one of totpCode or webauthn',
            }),
        )
        .output(z.object({ accessToken: z.string(), expiresAt: z.string(), scopes: z.array(z.string()) }))
        .mutation(async ({ ctx, input }) => {
          try {
            const elevated = await auth.stepUp({
              userId: ctx.principal.userId,
              sessionId: ctx.principal.sid,
              totpCode: input.totpCode,
              webauthn: input.webauthn,
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
     * WebAuthn (§4.1 `webauthn.enroll`, §9).
     *
     * Registration is two-step under a live session (options → verify), same
     * shape as TOTP. Authentication is passwordless: options → verify issues
     * the same session tokens as password login, with `mfa: true`.
     */
    webauthn: router({
      registerOptions: protectedProcedure.mutation(async ({ ctx }) => {
        if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
        try {
          return await auth.startWebauthnRegistration(ctx.principal.userId);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

      registerVerify: protectedProcedure
        .input(
          z.object({
            id: z.string().min(1),
            rawId: z.string().min(1),
            type: z.literal('public-key'),
            response: z.object({
              clientDataJSON: z.string().min(1),
              attestationObject: z.string().min(1),
              transports: z.array(z.string()).optional(),
            }),
            clientExtensionResults: z.record(z.unknown()).optional(),
          }),
        )
        .output(z.object({ credentialId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            return await auth.confirmWebauthnRegistration(ctx.principal.userId, input);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      authOptions: publicProcedure.input(z.object({ identifier: z.string().min(1) })).mutation(async ({ input }) => {
        if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
        try {
          return await auth.startWebauthnAuthentication(input.identifier);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

      authVerify: publicProcedure
        .input(
          z.object({
            identifier: z.string().min(1),
            credential: z.object({
              id: z.string().min(1),
              rawId: z.string().min(1),
              type: z.literal('public-key'),
              response: z.object({
                clientDataJSON: z.string().min(1),
                authenticatorData: z.string().min(1),
                signature: z.string().min(1),
                userHandle: z.string().nullish(),
              }),
              clientExtensionResults: z.record(z.unknown()).optional(),
            }),
          }),
        )
        .output(sessionOutput)
        .mutation(async ({ input }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            const session = await auth.confirmWebauthnAuthentication(input.identifier, input.credential);
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      list: protectedProcedure
        .output(
          z.array(
            z.object({
              credentialId: z.string(),
              createdAt: z.string(),
              transports: z.array(z.string()).optional(),
            }),
          ),
        )
        .query(async ({ ctx }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            return await auth.listWebauthnCredentials(ctx.principal.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Retire one enrolled authenticator. Self-only via principal.
       * Missing/foreign id → removed:false (never confirms existence).
       */
      remove: protectedProcedure
        .input(z.object({ credentialId: z.string().min(1) }))
        .output(z.object({ removed: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            const removed = await auth.removeWebauthnCredential(ctx.principal.userId, input.credentialId);
            return { removed };
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
            /**
             * Deliberately absent: a client-supplied `providerRef` was a free-text
             * side-channel into `kyc_records.provider_ref` (§10 PII isolation —
             * "pointer never holds a name or DOB"). Opaque refs are minted by the
             * encrypted document store (or operator tools) when that store lands;
             * user submit only opens a pending row.
             */
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
      // Self-only on the interactive surface. Modules use HMAC
      // GET /internal/rank/:userId/perks — never free userId on edge tRPC.
      get: scopedProcedure('identity:read')
        .input(z.object({}).optional())
        .output(rankStateSchema)
        .query(async ({ ctx }) => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });
          const snapshot = await rank.get(userId);
          return {
            userId: snapshot.userId,
            rank: snapshot.rank,
            xp: snapshot.xp.toString(),
            seasonXp: snapshot.seasonXp.toString(),
            nextRankAt: snapshot.xpToNext?.toString() ?? null,
            updatedAt: snapshot.updatedAt.toISOString(),
          };
        }),

      /** Interactive self-only. Cross-user hot path is S2S HMAC, not this. */
      perks: scopedProcedure('identity:read')
        .input(z.object({}).optional())
        .output(rankPerksSchema)
        .query(({ ctx }) => {
          const userId = ctx.principal.userId;
          if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Principal required' });
          return rank.perks(userId);
        }),

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
      /**
       * Public: long-lived key → short-lived access JWT.
       * This is what makes identity.apikeys real — create alone is not enough.
       */
      exchange: publicProcedure
        .input(z.object({ key: z.string().min(8).max(200) }))
        .output(
          z.object({
            accessToken: z.string(),
            expiresAt: z.string(),
            userId: z.string().uuid(),
            keyId: z.string().uuid(),
            scopes: z.array(z.string()),
            mode: z.enum(['live', 'sandbox']),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            const result = await auth.exchangeApiKey(input.key);
            return {
              accessToken: result.accessToken,
              expiresAt: result.expiresAt.toISOString(),
              userId: result.userId,
              keyId: result.keyId,
              scopes: result.scopes,
              mode: result.mode,
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      create: scopedProcedure('identity:write')
        .input(
          z.object({
            name: z.string().min(1).max(64),
            scopes: z.array(z.string()).min(1),
            domainWhitelist: z.array(z.string()).optional(),
            /** pay.public-api step 4 — sandbox keys route to the sandbox rail. */
            mode: z.enum(['live', 'sandbox']).optional(),
          }),
        )
        .output(z.object({ id: z.string(), key: z.string(), prefix: z.string(), mode: z.enum(['live', 'sandbox']) }))
        .mutation(async ({ ctx, input }) => {
          try {
            // `grantorScopes` comes from the verified principal, never from the
            // body. A key is a delegation of THIS session's authority, so the
            // ceiling has to be read from the token that asked for it.
            return await auth.createApiKey({
              userId: ctx.principal.userId,
              ...input,
              grantorScopes: ctx.principal.scopes,
            });
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
              mode: z.enum(['live', 'sandbox']),
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
            mode: k.mode === 'sandbox' ? ('sandbox' as const) : ('live' as const),
          }));
        }),

      revoke: scopedProcedure('identity:write')
        .input(z.object({ keyId: z.string().uuid() }))
        .output(z.object({ revoked: z.boolean() }))
        .mutation(async ({ ctx, input }) => ({ revoked: await auth.revokeApiKey(ctx.principal.userId, input.keyId) })),
    }),

    /**
     * Compliance freeze of an identity (SPEC-SUBACCOUNTS §3).
     * Cascades: user frozen + all sessions revoked + all sub-accounts + all API keys revoked.
     */
    compliance: router({
      freezeIdentity: scopedProcedure('admin:compliance')
        .input(z.object({ userId: z.string().uuid() }))
        .output(
          z.object({
            userId: z.string().uuid(),
            status: z.literal('frozen'),
            subAccountsRevoked: z.number().int(),
            apiKeysRevoked: z.number().int(),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            return await auth.freezeIdentity(input.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      unfreezeIdentity: scopedProcedure('admin:compliance')
        .input(z.object({ userId: z.string().uuid() }))
        .output(z.object({ userId: z.string().uuid(), status: z.literal('active') }))
        .mutation(async ({ input }) => {
          try {
            return await auth.unfreezeIdentity(input.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
    }),

    subAccounts: router({
      create: scopedProcedure('identity:write')
        .input(z.object({ label: z.string().min(1).max(64), purpose: z.string().max(200).optional() }))
        .output(z.object({ id: z.string().uuid() }))
        .mutation(({ ctx, input }) => auth.createSubAccount(ctx.principal.userId, input.label, input.purpose)),

      list: scopedProcedure('identity:read')
        .output(
          z.array(
            z.object({
              id: z.string().uuid(),
              label: z.string(),
              purpose: z.string().nullable(),
              revoked: z.boolean(),
              createdAt: z.string(),
            }),
          ),
        )
        .query(async ({ ctx }) => {
          const rows = await auth.listSubAccounts(ctx.principal.userId);
          return rows.map((r) => ({
            id: r.id,
            label: r.label,
            purpose: r.purpose,
            revoked: r.revoked,
            createdAt: r.createdAt.toISOString(),
          }));
        }),

      /**
       * Soft-disable. Self-only via principal.userId → parent_user_id.
       * No ledger posts — balances under this id are untouched.
       */
      revoke: scopedProcedure('identity:write')
        .input(z.object({ subAccountId: z.string().uuid() }))
        .output(z.object({ revoked: z.boolean() }))
        .mutation(async ({ ctx, input }) => ({
          revoked: await auth.revokeSubAccount(ctx.principal.userId, input.subAccountId),
        })),

      /**
       * Transfer ownership door (SPEC-SUBACCOUNTS residual).
       *
       * Pure assert — does not move value. Money services call this (or the
       * AuthService method) before posting `recipes.subAccountTransfer`. A
       * missing id refuses; it never defaults to primary.
       */
      assertTransferDoor: scopedProcedure('identity:write')
        .input(
          z.object({
            fromSubAccountId: z.string().uuid().optional().nullable(),
            toSubAccountId: z.string().uuid().optional().nullable(),
          }),
        )
        .output(z.object({ fromId: z.string().uuid(), toId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
          try {
            return await auth.assertSubAccountTransferDoor(ctx.principal.userId, input.fromSubAccountId, input.toSubAccountId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
    }),

    /**
     * Affiliate referral tree Slice A — attribution only (no commission, no pay).
     * Spec: docs/ops/trk/ops.affiliates.md Slice A.
     */
    affiliates: router({
      attribute: scopedProcedure('identity:write')
        .input(z.object({ referrerId: z.string().uuid() }))
        .output(
          z.object({
            userId: z.string().uuid(),
            referrerId: z.string().uuid(),
            attributedAt: z.string(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          try {
            const edge = await requireReferral().attribute({
              userId: ctx.principal.userId,
              referrerId: input.referrerId,
            });
            return {
              userId: edge.userId,
              referrerId: edge.referrerId,
              attributedAt: edge.attributedAt.toISOString(),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      myReferrer: scopedProcedure('identity:read')
        .output(
          z
            .object({
              userId: z.string().uuid(),
              referrerId: z.string().uuid(),
              attributedAt: z.string(),
            })
            .nullable(),
        )
        .query(async ({ ctx }) => {
          try {
            const edge = await requireReferral().edgeOf(ctx.principal.userId);
            if (!edge) return null;
            return {
              userId: edge.userId,
              referrerId: edge.referrerId,
              attributedAt: edge.attributedAt.toISOString(),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      myAncestors: scopedProcedure('identity:read')
        .output(z.array(z.string().uuid()))
        .query(async ({ ctx }) => {
          try {
            return await requireReferral().ancestorsOf(ctx.principal.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Affiliate self-view of durable commission accruals only.
       * Always scoped to ctx.principal.userId — no beneficiaryId input (foreign refuse by design).
       * Empty list when no rows / rates unpublished (never invents rates or amounts).
       * Payout remains refuse-closed (affiliates.payout).
       */
      myAccruals: scopedProcedure('identity:read')
        .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
        .output(
          z.object({
            rows: z.array(
              z.object({
                feeEventId: z.string(),
                beneficiaryId: z.string().uuid(),
                payerId: z.string().uuid(),
                hop: z.number().int(),
                rate: z.string(),
                feeAmount: z.string(),
                commissionAmount: z.string(),
                asset: z.string(),
                accruedAt: z.string(),
              }),
            ),
          }),
        )
        .query(async ({ ctx, input }) => {
          try {
            const store = requireAccruals();
            // Self-only: never accept a foreign beneficiaryId.
            const rows = await store.listByBeneficiary(ctx.principal.userId, input?.limit);
            return {
              rows: rows.map((r) => ({
                feeEventId: r.feeEventId,
                beneficiaryId: r.beneficiaryId,
                payerId: r.payerId,
                hop: r.hop,
                rate: r.rate,
                feeAmount: r.feeAmount,
                commissionAmount: r.commissionAmount,
                asset: r.asset,
                accruedAt: r.accruedAt.toISOString(),
              })),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** Operator freeze beneficiary — skips accrual; no payout path here. */
      freeze: scopedProcedure('admin:write')
        .input(z.object({ beneficiaryId: z.string().uuid(), reason: z.string().min(3).max(500) }))
        .output(
          z.object({
            beneficiaryId: z.string().uuid(),
            frozenBy: z.string().uuid(),
            reason: z.string(),
            frozenAt: z.string(),
            honestyLine: z.string(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          try {
            const svc = requireFreeze();
            const rec = await svc.freeze({
              beneficiaryId: input.beneficiaryId,
              frozenBy: ctx.principal.userId,
              reason: input.reason,
            });
            const frozenIds = await svc.frozenIds();
            return {
              beneficiaryId: rec.beneficiaryId,
              frozenBy: rec.frozenBy,
              reason: rec.reason,
              frozenAt: rec.frozenAt.toISOString(),
              honestyLine: affiliateFreezeHonestyLine({
                beneficiaryId: rec.beneficiaryId,
                frozenIds,
                action: 'freeze',
              }),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      unfreeze: scopedProcedure('admin:write')
        .input(z.object({ beneficiaryId: z.string().uuid() }))
        .output(
          z.object({
            beneficiaryId: z.string().uuid(),
            frozenBy: z.string().uuid(),
            reason: z.string(),
            frozenAt: z.string(),
            honestyLine: z.string(),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            const svc = requireFreeze();
            const rec = await svc.unfreeze(input.beneficiaryId);
            const frozenIds = await svc.frozenIds();
            return {
              beneficiaryId: rec.beneficiaryId,
              frozenBy: rec.frozenBy,
              reason: rec.reason,
              frozenAt: rec.frozenAt.toISOString(),
              honestyLine: affiliateFreezeHonestyLine({
                beneficiaryId: rec.beneficiaryId,
                frozenIds,
                action: 'unfreeze',
              }),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      freezes: scopedProcedure('admin:read')
        .output(
          z.array(
            z.object({
              beneficiaryId: z.string().uuid(),
              frozenBy: z.string().uuid(),
              reason: z.string(),
              frozenAt: z.string(),
            }),
          ),
        )
        .query(async () => {
          try {
            const rows = await requireFreeze().list();
            return rows.map((r) => ({
              beneficiaryId: r.beneficiaryId,
              frozenBy: r.frozenBy,
              reason: r.reason,
              frozenAt: r.frozenAt.toISOString(),
            }));
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Stage admin read — multi-tier tree board (structure + freeze count).
       * No rates, no payout amounts.
       */
      treeStatus: scopedProcedure('admin:read')
        .output(
          z.object({
            edges: z.number().int().nonnegative(),
            referrers: z.number().int().nonnegative(),
            maxDepth: z.number().int().nonnegative(),
            frozenCount: z.number().int().nonnegative(),
            maxDepthCap: z.number().int().positive(),
            statusLine: z.string(),
          }),
        )
        .query(async () => {
          try {
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();
            const board = await requireReferral().treeBoard(frozen);
            return {
              ...board,
              statusLine: affiliateTreeStatusLine(board),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Stage admin read — one node's place in the IB / affiliate tree.
       * Structure + freeze flag only.
       */
      node: scopedProcedure('admin:read')
        .input(z.object({ userId: z.string().uuid() }))
        .output(
          z.object({
            userId: z.string().uuid(),
            referrerId: z.string().uuid().nullable(),
            depth: z.number().int().nonnegative(),
            ancestors: z.array(z.string().uuid()),
            directDownline: z.array(z.string().uuid()),
            directDownlineCount: z.number().int().nonnegative(),
            frozen: z.boolean(),
            attributedAt: z.string().nullable(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();
            const node = await requireReferral().nodeStatus(input.userId, frozen);
            return {
              userId: node.userId,
              referrerId: node.referrerId,
              depth: node.depth,
              ancestors: [...node.ancestors],
              directDownline: [...node.directDownline],
              directDownlineCount: node.directDownlineCount,
              frozen: node.frozen,
              attributedAt: node.attributedAt,
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Stage-2 admin read — attributed member roster (+ optional root filter).
       * Structure + freeze overlay only; no rates / payouts.
       */
      members: scopedProcedure('admin:read')
        .input(z.object({ rootId: z.string().uuid().optional() }).optional())
        .output(
          z.object({
            members: z.array(
              z.object({
                userId: z.string().uuid(),
                referrerId: z.string().uuid(),
                depth: z.number().int().nonnegative(),
                frozen: z.boolean(),
                attributedAt: z.string().nullable(),
              }),
            ),
            total: z.number().int().nonnegative(),
            frozenInList: z.number().int().nonnegative(),
            maxDepthInList: z.number().int().nonnegative(),
            rootId: z.string().uuid().nullable(),
            statusLine: z.string(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();
            const rootId = input?.rootId ?? null;
            const { members, board } = await requireReferral().listMembers(frozen, rootId);
            return {
              members: members.map((m) => ({
                userId: m.userId,
                referrerId: m.referrerId,
                depth: m.depth,
                frozen: m.frozen,
                attributedAt: m.attributedAt,
              })),
              total: board.total,
              frozenInList: board.frozenInList,
              maxDepthInList: board.maxDepthInList,
              rootId: board.rootId,
              statusLine: affiliateMemberListStatusLine(board),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Class M payout — refuse-closed. DIRECTION §8 rates are owner-only;
       * never invent fee-share bps or post ledger from this path.
       */
      payout: scopedProcedure('admin:write')
        .input(
          z.object({
            beneficiaryId: z.string().uuid().optional(),
            dryRun: z.boolean().optional(),
          }),
        )
        .mutation(async () => {
          try {
            refuseAffiliatePayout();
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Slice B dry-run: fee event → commission rows using durable tree + freezes.
       * NEVER posts ledger. Zero fee → empty rows. Payout is Class M residual.
       */
      accrueDryRun: scopedProcedure('admin:read')
        .input(
          z.object({
            feeEventId: z.string().min(1).max(120),
            userId: z.string().uuid(),
            feeAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/),
            asset: z.string().min(1).max(32),
            at: z.string().datetime().optional(),
            tiers: z
              .array(
                z.object({
                  hop: z.number().int().min(0).max(20),
                  rate: z.string().regex(/^(0(\.\d{1,18})?|1(\.0{1,18})?)$/),
                }),
              )
              .max(20)
              .optional(),
          }),
        )
        .output(
          z.object({
            rows: z.array(
              z.object({
                feeEventId: z.string(),
                beneficiaryId: z.string().uuid(),
                payerId: z.string().uuid(),
                hop: z.number().int(),
                rate: z.string(),
                feeAmount: z.string(),
                commissionAmount: z.string(),
                asset: z.string(),
                accruedAt: z.string(),
              }),
            ),
            frozenSkipped: z.number().int(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const parent = await requireReferral().loadParentMap();
            const frozen = await requireFreeze().frozenIds();
            // No DEFAULT_ACCRUAL_TIERS — refuse when neither request nor owner law supplies rates.
            const tiers: readonly TierRate[] = resolveAccrualTiers({
              requestTiers: input.tiers,
              law: accrualTierLaw,
            });
            const fee = {
              feeEventId: input.feeEventId,
              userId: input.userId,
              feeAmount: input.feeAmount,
              asset: input.asset,
              at: input.at ? new Date(input.at) : new Date(),
            };
            const without = accrueCommission({ fee, parent, tiers });
            const withFreeze = accrueWithFreezes({
              fee,
              parent,
              tiers,
              frozenBeneficiaryIds: frozen,
            });
            return {
              frozenSkipped: Math.max(0, without.length - withFreeze.length),
              rows: withFreeze.map((r) => ({
                feeEventId: r.feeEventId,
                beneficiaryId: r.beneficiaryId,
                payerId: r.payerId,
                hop: r.hop,
                rate: r.rate,
                feeAmount: r.feeAmount,
                commissionAmount: r.commissionAmount,
                asset: r.asset,
                accruedAt: r.accruedAt.toISOString(),
              })),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Slice B persist: same accrual as dry-run, written to durable store.
       * NEVER posts ledger. Idempotent on (feeEventId, beneficiary, hop).
       * Zero fee → zero rows. Payout remains refuse-closed (Slice C / §8).
       * Rates: request tiers or owner-published law only — never invent.
       */
      accrue: scopedProcedure('admin:write')
        .input(
          z.object({
            feeEventId: z.string().min(1).max(120),
            userId: z.string().uuid(),
            feeAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/),
            asset: z.string().min(1).max(32),
            at: z.string().datetime().optional(),
            tiers: z
              .array(
                z.object({
                  hop: z.number().int().min(0).max(20),
                  rate: z.string().regex(/^(0(\.\d{1,18})?|1(\.0{1,18})?)$/),
                }),
              )
              .max(20)
              .optional(),
          }),
        )
        .output(
          z.object({
            inserted: z.number().int(),
            rows: z.array(
              z.object({
                feeEventId: z.string(),
                beneficiaryId: z.string().uuid(),
                payerId: z.string().uuid(),
                hop: z.number().int(),
                rate: z.string(),
                feeAmount: z.string(),
                commissionAmount: z.string(),
                asset: z.string(),
                accruedAt: z.string(),
              }),
            ),
            frozenSkipped: z.number().int(),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            const parent = await requireReferral().loadParentMap();
            const frozen = await requireFreeze().frozenIds();
            const store = requireAccruals();
            const tiers: readonly TierRate[] = resolveAccrualTiers({
              requestTiers: input.tiers,
              law: accrualTierLaw,
            });
            const fee = {
              feeEventId: input.feeEventId,
              userId: input.userId,
              feeAmount: input.feeAmount,
              asset: input.asset,
              at: input.at ? new Date(input.at) : new Date(),
            };
            const without = accrueCommission({ fee, parent, tiers });
            const withFreeze = accrueWithFreezes({
              fee,
              parent,
              tiers,
              frozenBeneficiaryIds: frozen,
            });
            const inserted = await store.saveRows(withFreeze);
            const stored = await store.listByFeeEvent(input.feeEventId);
            return {
              inserted,
              frozenSkipped: Math.max(0, without.length - withFreeze.length),
              rows: stored.map((r) => ({
                feeEventId: r.feeEventId,
                beneficiaryId: r.beneficiaryId,
                payerId: r.payerId,
                hop: r.hop,
                rate: r.rate,
                feeAmount: r.feeAmount,
                commissionAmount: r.commissionAmount,
                asset: r.asset,
                accruedAt: r.accruedAt.toISOString(),
              })),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
    }),
  });
}

export type IdentityRouter = ReturnType<typeof createIdentityRouter>;
