import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { rankPerksSchema, rankStateSchema } from '@intafaced/contracts';
import { AuthError, type AuthService } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';

/**
 * svc-identity's API (§4.1).
 *
 * The contract shape lives in `packages/contracts` — this implements it. A
 * breaking change there is a compile error here, caught in the contracts PR
 * before any consumer is touched (§15.2).
 */

function toTrpcError(err: unknown): TRPCError {
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
       * Service-to-service. Modules award XP by calling this rather than by
       * writing rank_state — svc-identity is the only writer (§4.1).
       *
       * SCOPED, not public. This was `publicProcedure` with only a comment
       * saying "service-to-service", which is a comment, not a control: the
       * moment the router is mounted, anyone could award themselves XP, and XP
       * drives rank, which drives fee discounts, P2P limits and launchpad
       * allocation. `identity:write` is a scope no user session carries for
       * another account, and `requireOwnership` is deliberately NOT applied
       * because the caller is a service acting on a user's behalf.
       *
       * Found by partner audit.
       */
      awardXp: scopedProcedure('identity:write')
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
