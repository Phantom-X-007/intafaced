import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import {
  formatAmount,
  parseAmount,
  accountRefSchema,
  postRequestSchema,
  InsufficientFundsError,
  LedgerError,
  UnbalancedTransactionError,
  InvalidEntryError,
  type EntryInput,
} from '@intafaced/ledger-client';
import type { LedgerService } from './service.js';

/**
 * svc-ledger's internal API.
 *
 * Note what is NOT here: there is no user-facing write. `post` is called by
 * other SERVICES with service credentials, never by a user token — which is why
 * `packages/auth` has no `ledger:write` scope at all. A user moves value by
 * asking a module to do something (place an order, release an escrow); the
 * module decides whether that is legal and posts the recipe.
 */

function toTrpcError(err: unknown): TRPCError {
  if (err instanceof InsufficientFundsError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof UnbalancedTransactionError || err instanceof InvalidEntryError) {
    // A malformed transaction is a bug in the calling service, not user error.
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
  }
  if (err instanceof LedgerError && err.code === 'ledger.frozen') {
    return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
  }
  if (err instanceof LedgerError) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Ledger post failed', cause: err });
}

const balanceOutput = z.object({
  accountId: z.string(),
  assetId: z.string(),
  kind: z.string(),
  amount: z.string(),
});

export function createLedgerRouter(ledger: LedgerService) {
  return router({
    // Reads the freeze row rather than a cached field: a replica that reports
    // itself healthy while the shared book is frozen is worse than no health
    // check at all.
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-ledger'), postingEnabled: z.boolean() }))
      .query(async () => ({ ok: true, service: 'svc-ledger' as const, postingEnabled: (await ledger.status()).postingEnabled })),

    /** Service-to-service only. Amounts arrive as decimal strings. */
    post: publicProcedure
      .input(postRequestSchema)
      .output(z.object({ txId: z.string(), hash: z.string(), postedAt: z.string() }))
      .mutation(async ({ input }) => {
        const entries: EntryInput[] = input.entries.map((e) => ({
          account: e.account,
          direction: e.direction,
          amount: parseAmount(e.amount),
        }));

        try {
          const tx = await ledger.post({
            idempotencyKey: input.idempotencyKey,
            module: input.module,
            reason: input.reason,
            entries,
            ...(input.meta ? { meta: input.meta } : {}),
            ...(input.correlationId ? { correlationId: input.correlationId } : {}),
          });
          return { txId: tx.id, hash: tx.hash, postedAt: tx.postedAt.toISOString() };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    balance: scopedProcedure('ledger:read')
      .input(accountRefSchema)
      .output(balanceOutput)
      .query(async ({ input }) => {
        const balance = await ledger.balance(input);
        return {
          accountId: balance.accountId,
          assetId: input.assetId,
          kind: input.kind,
          amount: formatAmount(balance.amount),
        };
      }),

    balances: scopedProcedure('ledger:read')
      .input(z.object({ ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']), ownerId: z.string() }))
      .output(z.array(balanceOutput))
      .query(async ({ ctx, input }) => {
        // A principal may only read its own balances, whatever its scopes say.
        if (input.ownerType === 'user' && ctx.principal.userId !== input.ownerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This account belongs to another user' });
        }

        const balances = await ledger.balances(input.ownerType, input.ownerId);
        return balances.map((b) => ({
          accountId: b.accountId,
          assetId: b.account.assetId,
          kind: b.account.kind,
          amount: formatAmount(b.amount),
        }));
      }),

    // ── Operator surface (§14 admin controls) ────────────────────────────────

    reconcile: scopedProcedure('admin:treasury')
      .output(
        z.object({
          ok: z.boolean(),
          accountsChecked: z.number(),
          chainLength: z.number(),
          unbalancedAssets: z.array(z.string()),
        }),
      )
      .mutation(async () => {
        const report = await ledger.reconcile();
        return {
          ok: report.ok,
          accountsChecked: report.balances.accountsChecked,
          chainLength: report.chain.ok ? report.chain.length : 0,
          unbalancedAssets: report.unbalancedAssets,
        };
      }),

    /**
     * The freeze is durable, so this returns what the DATABASE now holds rather
     * than the constant it used to. `frozenBy` is echoed back because the
     * operator halting the platform should see their own name land on the
     * record — and because on a book already frozen by reconciliation, the
     * reply naming a different actor is the fastest way to find that out.
     */
    freeze: scopedProcedure('admin:treasury')
      .input(z.object({ reason: z.string().min(1) }))
      .output(z.object({ postingEnabled: z.boolean(), frozenReason: z.string().nullable(), frozenBy: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const state = await ledger.freeze(input.reason, ctx.principal.userId);
        return { postingEnabled: !state.frozen, frozenReason: state.reason, frozenBy: state.actor };
      }),

    unfreeze: scopedProcedure('admin:treasury')
      .output(z.object({ postingEnabled: z.boolean(), frozenReason: z.string().nullable(), frozenBy: z.string().nullable() }))
      .mutation(async ({ ctx }) => {
        const state = await ledger.unfreeze(ctx.principal.userId);
        return { postingEnabled: !state.frozen, frozenReason: state.reason, frozenBy: state.actor };
      }),
  });
}

export type LedgerRouter = ReturnType<typeof createLedgerRouter>;
