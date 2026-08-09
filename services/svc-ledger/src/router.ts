import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, serviceProcedure, TRPCError } from '@intafaced/contracts';
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
import { historyInputSchema, parseHistoryRange } from './ledger/history.js';
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
  // The window as asked cannot be answered, and retrying it unchanged never
  // will be. Same status as `s2s-http.httpError` gives these two, so the mounted
  // route and its twin cannot tell a caller different things about one refusal.
  if (err instanceof LedgerError && (err.code === 'ledger.history_range_invalid' || err.code === 'ledger.history_range_too_large')) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
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

    /**
     * Service-to-service only — and now enforced, not merely documented.
     *
     * This was `publicProcedure`, justified by the note above: there is no
     * `ledger:write` scope, so no user token can post. That reasoning is
     * inverted. `publicProcedure` checks no scope at all, so the absence of
     * `ledger:write` removed the last thing that could have been checked.
     *
     * Mounted, that meant anyone reaching the port could post a balanced
     * transaction crediting `railBoundary` — a `treasury` account, the one
     * owner type allowed to run negative — and debiting their own `available`.
     * That is the `deposit` recipe. Sum-to-zero passes, non-negative passes,
     * paired locks pass: the transaction is well-formed, just unauthorised.
     *
     * `serviceProcedure` requires the caller to prove it is a service holding
     * the internal secret (§2).
     */
    post: serviceProcedure
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

    /**
     * Entry history for one account in one window (§8.1 projection source).
     *
     * `serviceProcedure`, not `scopedProcedure('ledger:read')`, and the choice
     * is not a coin flip:
     *
     *   · The caller is a SERVICE. svc-bank folds this into a spend summary
     *     after deciding, with the user's token, which spaces that user may see.
     *     It holds service credentials on this path and forwards no user token,
     *     so a scoped procedure would reject the only caller there is.
     *
     *   · The input is a bare `AccountRef`, which can name `house` and
     *     `treasury` accounts — `rail:*`, `fees:*`, `mint`. `balances` can
     *     restrict a principal to its own rows because its input carries the
     *     owner and `ctx.principal` can be compared against it; here the same
     *     check would have to trust the caller to say who it is asking for.
     *     Under `ledger:read` that turns every holder of a read scope into
     *     someone who can enumerate the platform's own movements, transaction by
     *     transaction. Service credentials are the stronger statement, and the
     *     true one about who calls this.
     *
     *   · AUTHORISATION IS THE MODULE'S JOB (README: this service "does not
     *     decide whether a movement is allowed"). The same split applies to
     *     reads — svc-ledger answers what the book says to a caller that proved
     *     it is one of ours; WHICH HUMAN may see it is svc-bank's question, and
     *     svc-bank already asks it.
     *
     * Served on no port, like every procedure in this file: `index.ts` exports
     * this router for its TYPE and registers no tRPC plugin. The reachable
     * surface is `registerS2sHttp`, where `/trpc/history` is mounted behind the
     * same service-credential guard. This entry exists so the two describe one
     * API — it is not what makes the route safe.
     */
    history: serviceProcedure
      .input(historyInputSchema)
      .output(
        z.array(
          z.object({
            txId: z.string(),
            module: z.string(),
            reason: z.string(),
            direction: z.enum(['debit', 'credit']),
            /** Decimal string. Money never crosses as a `number`. */
            amount: z.string(),
            postedAt: z.string(),
          }),
        ),
      )
      .query(async ({ input }) => {
        try {
          const range = parseHistoryRange(input.from, input.to);
          const entries = await ledger.history(input.account, range);
          return entries.map((e) => ({
            txId: e.txId,
            module: e.module,
            reason: e.reason,
            direction: e.direction,
            amount: formatAmount(e.amount),
            postedAt: e.postedAt.toISOString(),
          }));
        } catch (err) {
          throw toTrpcError(err);
        }
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
      // Same floor as POST /operator/freeze: a twelve-character minimum forces a
      // sentence the next operator can act on. `min(1)` accepted "x" and left
      // the durable row unactionable — the database only refuses empty reason,
      // not a useless one. Cap matches the HTTP schema (500).
      .input(z.object({ reason: z.string().min(12).max(500) }))
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
