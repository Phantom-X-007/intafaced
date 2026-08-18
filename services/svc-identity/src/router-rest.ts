import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, serviceProcedure, TRPCError } from '@intafaced/contracts';
import { rankPerksSchema, rankStateSchema } from '@intafaced/contracts';
import type { AuthService } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';
import { toTrpcError } from './router-shared.js';

export function createRankRouter(args: { rank: RankService }) {
  const { rank } = args;
  return router({
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
  });
}

export function createApiKeysRouter(args: { auth: AuthService }) {
  const { auth } = args;
  return router({
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
      .mutation(async ({ input, ctx }) => {
        try {
          // Origin is read from the trusted edge request, never from the body.
          // A non-empty domain_whitelist refuses foreign or missing origins.
          const clientOrigin = (ctx as { clientOrigin?: string }).clientOrigin;
          const result = await auth.exchangeApiKey(input.key, clientOrigin);
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
  });
}

export function createComplianceRouter(args: { auth: AuthService }) {
  const { auth } = args;
  return router({
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
  });
}

export function createSubAccountsRouter(args: { auth: AuthService }) {
  const { auth } = args;
  return router({
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
     * Single-row ownership door (SPEC-SUBACCOUNTS §2 / D26-P1-I1).
     *
     * Pure assert — does not move value. Trade and other money surfaces that
     * name one partition call this (or the S2S ownership snapshot with the
     * same checks) before acting. Missing id refuses; never defaults to primary.
     */
    assertOwned: scopedProcedure('identity:write')
      .input(
        z.object({
          subAccountId: z.string().uuid().optional().nullable(),
        }),
      )
      .output(z.object({ id: z.string().uuid(), parentUserId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await auth.assertSubAccountOwned(ctx.principal.userId, input.subAccountId);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    /**
     * Transfer ownership door (SPEC-SUBACCOUNTS §1–§2 / D26-P1-I1).
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
  });
}
