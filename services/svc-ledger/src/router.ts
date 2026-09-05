import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, serviceProcedure, TRPCError } from '@intafaced/contracts';
import {
  formatAmount,
  parseAmount,
  accountPurpose,
  accountRefSchema,
  postRequestSchema,
  InsufficientFundsError,
  LedgerError,
  UnbalancedTransactionError,
  InvalidEntryError,
  type EntryInput,
} from '@intafaced/ledger-client';
import { composePortfolioView, portfolioViewSchema } from '@intafaced/portfolio-view';
import { parseHistoryDoorInput, parseHistoryRange } from './ledger/history.js';
import { statementPnlFromThisBook, statementPnlInputSchema, statementPnlResultSchema } from './ledger/statement-pnl.js';
import type { LedgerService } from './service.js';
import { userCopy } from './user-copy.js';

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
    return new TRPCError({ code: 'BAD_REQUEST', message: userCopy(err.code), cause: err });
  }
  if (err instanceof UnbalancedTransactionError || err instanceof InvalidEntryError) {
    // A malformed transaction is a bug in the calling service, not user error.
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: userCopy(err.code), cause: err });
  }
  if (err instanceof LedgerError && err.code === 'ledger.frozen') {
    return new TRPCError({ code: 'PRECONDITION_FAILED', message: userCopy(err.code), cause: err });
  }
  // Already frozen under another actor/reason — conflict, not internal error.
  // Mirrors operator HTTP 409 so both doors name the same refusal.
  if (err instanceof LedgerError && err.code === 'ledger.freeze_attributed') {
    return new TRPCError({ code: 'CONFLICT', message: userCopy(err.code), cause: err });
  }
  // The window as asked cannot be answered, and retrying it unchanged never
  // will be. Same status as `s2s-http.httpError` gives these two, so the mounted
  // route and its twin cannot tell a caller different things about one refusal.
  // Cap / range copy stays on the error — it is caller-actionable, not catalog.
  if (
    err instanceof LedgerError &&
    (err.code === 'ledger.history_range_invalid' ||
      err.code === 'ledger.history_range_too_large' ||
      err.code === 'ledger.history_page_socket')
  ) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof LedgerError) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: userCopy(err.code), cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: userCopy('error.generic'), cause: err });
}

const balanceOutput = z.object({
  accountId: z.string(),
  assetId: z.string(),
  kind: z.string(),
  // Purpose is account IDENTITY (P0-3), not optional decoration. Two holds with
  // different claims must not collapse to the same (assetId, kind) on the wire —
  // callers that key by those alone would re-commingle what the book keeps apart.
  purpose: z.string(),
  amount: z.string(),
});

export interface LedgerIndexerCompose {
  readonly url?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createLedgerRouter(ledger: LedgerService, indexer?: LedgerIndexerCompose) {
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
          purpose: accountPurpose(input),
          amount: formatAmount(balance.amount),
        };
      }),

    balances: scopedProcedure('ledger:read')
      .input(z.object({ ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']), ownerId: z.string() }))
      .output(z.array(balanceOutput))
      .query(async ({ ctx, input }) => {
        // A principal may only read its own balances, whatever its scopes say.
        if (input.ownerType === 'user' && ctx.principal.userId !== input.ownerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: userCopy('error.forbidden') });
        }

        const balances = await ledger.balances(input.ownerType, input.ownerId);
        return balances.map((b) => ({
          accountId: b.accountId,
          assetId: b.account.assetId,
          kind: b.account.kind,
          purpose: b.account.purpose ?? '',
          amount: formatAmount(b.amount),
        }));
      }),

    /**
     * Portfolio VIEW (§25:723). Reads `ledger.balances`. Does not post.
     * Chain half is HTTP/tRPC to svc-indexer `positions` when INDEXER_URL and a
     * 0x `chainAccount` are both usable. Otherwise named
     * `indexer.portfolio_positions_unwired` — never a zero chain balance.
     * Owner UUID is not an EVM address; this door does not invent one.
     */
    portfolio: scopedProcedure('ledger:read')
      .input(
        z.object({
          ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']),
          ownerId: z.string(),
          chainAccount: z
            .string()
            .regex(/^0x[0-9a-fA-F]{40}$/)
            .optional(),
        }),
      )
      .output(portfolioViewSchema)
      .query(async ({ ctx, input }) => {
        if (input.ownerType === 'user' && ctx.principal.userId !== input.ownerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This account belongs to another user' });
        }

        const balances = await ledger.balances(input.ownerType, input.ownerId);
        return composePortfolioView({
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          balances,
          url: indexer?.url ?? process.env.INDEXER_URL,
          chainAccount: input.chainAccount,
          fetch: indexer?.fetch,
        });
      }),

    /**
     * Customer statement PnL/NAV (PTX-M14-R01/R02).
     *
     * Realized/unrealized/NAV come only from lot basis, marks, and NAV inputs.
     * This book does not store those — missing is a typed refuse, never 0 PnL.
     * Does not post. Does not invent FIFO lots from history amounts.
     */
    statementPnl: scopedProcedure('ledger:read')
      .input(statementPnlInputSchema)
      .output(statementPnlResultSchema)
      .query(async ({ ctx, input }) => {
        if (input.ownerType === 'user' && ctx.principal.userId !== input.ownerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: userCopy('error.forbidden') });
        }
        return statementPnlFromThisBook(input);
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
      .input(z.unknown())
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
          const parsed = parseHistoryDoorInput(input);
          const range = parseHistoryRange(parsed.from, parsed.to);
          const entries = await ledger.history(parsed.account, range);
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
          /** Present only when the hash chain failed — where verification stopped. */
          chainBrokenAt: z.string().optional(),
        }),
      )
      .mutation(async () => {
        const report = await ledger.reconcile();
        // chainLength is the number of transactions that verified, even on a
        // break — never collapse a broken chain to 0 (that looks like an empty
        // healthy book). Same shape as POST /operator/reconcile.
        return {
          ok: report.ok,
          accountsChecked: report.balances.accountsChecked,
          chainLength: report.chain.length,
          unbalancedAssets: report.unbalancedAssets,
          ...(!report.chain.ok && 'brokenAt' in report.chain ? { chainBrokenAt: report.chain.brokenAt } : {}),
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
      .input(
        z.object({
          // Same floor as POST /operator/freeze — trim so spaces cannot pad min(12).
          reason: z
            .string()
            .transform((s) => s.trim())
            .pipe(z.string().min(12).max(500)),
        }),
      )
      .output(z.object({ postingEnabled: z.boolean(), frozenReason: z.string().nullable(), frozenBy: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const state = await ledger.freeze(input.reason, ctx.principal.userId);
          return { postingEnabled: !state.frozen, frozenReason: state.reason, frozenBy: state.actor };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    unfreeze: scopedProcedure('admin:treasury')
      .output(z.object({ postingEnabled: z.boolean(), frozenReason: z.string().nullable(), frozenBy: z.string().nullable() }))
      .mutation(async ({ ctx }) => {
        try {
          const state = await ledger.unfreeze(ctx.principal.userId);
          return { postingEnabled: !state.frozen, frozenReason: state.reason, frozenBy: state.actor };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),
  });
}

export type LedgerRouter = ReturnType<typeof createLedgerRouter>;
