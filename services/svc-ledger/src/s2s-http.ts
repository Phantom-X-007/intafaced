import type { FastifyInstance, FastifyReply } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
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
import { z } from 'zod';
import type { LedgerService } from './service.js';

/**
 * Plain S2S HTTP surface used by service ledger-clients.
 *
 * Bodies are raw JSON (not the tRPC envelope). Kept out of `index.ts` so the
 * DoD gate can require a real import from a test without booting Postgres.
 */

/**
 * `code` travels with `message`, and that is not decoration.
 *
 * ── The bug this closed ─────────────────────────────────────────────────────
 *
 * Every service ledger-client throws a plain `Error` carrying the response text
 * when the ledger refuses. `svc-trade`'s `toTrpcError` branches on
 * `err instanceof InsufficientFundsError`, which a plain `Error` never is — so
 * a user with too little balance received **500 INTERNAL_SERVER_ERROR** from
 * the live fleet, not the 400 the router's own comment promises:
 *
 *   "`ledger.insufficient_funds` must NOT look retryable — retrying a rejected
 *    hold just rejects it again."
 *
 * 500 is the most retryable class there is, so the contract said one thing and
 * the platform did the opposite. Invisible to unit tests, which use the
 * in-process ledger and get the typed error directly; only a request crossing a
 * real process boundary could see it. Found by `tooling/e2e`.
 *
 * A status code alone is not enough to fix it: 400 is also what a Zod failure
 * returns, and "you cannot afford this" and "your request was malformed" are
 * not the same answer. The code is the machine-readable half, additive to the
 * existing body so no caller breaks.
 */
export function httpError(err: unknown): { status: number; body: { message: string; code?: string } } {
  if (err instanceof InsufficientFundsError) return { status: 400, body: { message: err.message, code: err.code } };
  if (err instanceof UnbalancedTransactionError || err instanceof InvalidEntryError) {
    return { status: 500, body: { message: err.message, code: err.code } };
  }
  // 401, not 403: the caller has not said who it is. "Known and not allowed" is
  // a different answer and must stay distinguishable to a calling service.
  if (err instanceof LedgerError && err.code === 'ledger.unauthenticated') {
    return { status: 401, body: { message: err.message, code: err.code } };
  }
  if (err instanceof LedgerError && err.code === 'ledger.frozen') {
    return { status: 412, body: { message: err.message, code: err.code } };
  }
  if (err instanceof LedgerError) return { status: 500, body: { message: err.message, code: err.code } };
  if (err instanceof z.ZodError) return { status: 400, body: { message: err.message, code: 'ledger.invalid_request' } };
  return { status: 500, body: { message: 'Ledger request failed' } };
}

const balancesInput = z.object({
  ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']),
  ownerId: z.string(),
});

export async function handleS2sPost(ledger: LedgerService, body: unknown) {
  const input = postRequestSchema.parse(body);
  const entries: EntryInput[] = input.entries.map((e) => ({
    account: e.account,
    direction: e.direction,
    amount: parseAmount(e.amount),
  }));
  const tx = await ledger.post({
    idempotencyKey: input.idempotencyKey,
    module: input.module,
    reason: input.reason,
    entries,
    ...(input.meta ? { meta: input.meta } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  });
  return { txId: tx.id, hash: tx.hash, postedAt: tx.postedAt.toISOString() };
}

export async function handleS2sBalance(ledger: LedgerService, body: unknown) {
  const input = accountRefSchema.parse(body);
  const balance = await ledger.balance(input);
  return {
    accountId: balance.accountId,
    assetId: input.assetId,
    kind: input.kind,
    amount: formatAmount(balance.amount),
  };
}

export async function handleS2sBalances(ledger: LedgerService, body: unknown) {
  const input = balancesInput.parse(body);
  const balances = await ledger.balances(input.ownerType, input.ownerId);
  return balances.map((b) => ({
    accountId: b.accountId,
    assetId: b.account.assetId,
    kind: b.account.kind,
    amount: formatAmount(b.amount),
  }));
}

/**
 * THIS is the surface that is actually served.
 *
 * `createLedgerRouter` is constructed in `index.ts` and exported for its TYPE.
 * Nothing registers `fastifyTRPCPlugin` here, so the tRPC procedures — and every
 * guard on them — are unreachable from the port. Scoping `post` to
 * `serviceProcedure` in the router (as an earlier revision of this PR did)
 * changed a type signature and nothing a caller could reach.
 *
 * These three raw handlers are the real money plane, and they had no
 * authentication of any kind. `/trpc/post` reaches `ledger.post()` directly, so
 * anyone able to reach the port could credit `railBoundary` — a `treasury`
 * account, the one owner type allowed to run negative — and debit their own
 * `available`. That is the `deposit` recipe: well-formed, every invariant
 * satisfied, and unauthorised.
 *
 * A guard written on one door does not secure the other one.
 */
export function registerS2sHttp(app: FastifyInstance, ledger: LedgerService, internalSecret: string): void {
  /**
   * Refuse before the handler runs, so an unauthenticated request never reaches
   * `ledger.post` at all — not even to be rejected by it later.
   */
  const authenticate = (req: { headers: Record<string, string | string[] | undefined> }): string => {
    const { service } = verifyServiceHeaders(req.headers, internalSecret);
    if (!service) {
      throw new LedgerError('Service credentials are required on the internal ledger API (§2)', 'ledger.unauthenticated');
    }
    return service;
  };

  const guarded =
    <T>(handle: (ledger: LedgerService, body: unknown) => Promise<T>) =>
    async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, reply: FastifyReply) => {
      try {
        authenticate(req);
        return await handle(ledger, req.body);
      } catch (err) {
        const { status, body } = httpError(err);
        return reply.code(status).send(body);
      }
    };

  app.post('/trpc/post', guarded(handleS2sPost));
  app.post('/trpc/balance', guarded(handleS2sBalance));
  app.post('/trpc/balances', guarded(handleS2sBalances));
}
