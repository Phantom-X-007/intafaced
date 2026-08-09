import { formatAmount, rehydrateLedgerHttpError, type LedgerClient, type LedgerTx, type PostRequest } from '@intafaced/ledger-client';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';

/**
 * HTTP client for svc-ledger — affiliate commission payout only.
 *
 * §0.6 / §2: svc-identity stores no balances and owns none of the balance
 * graph. The one money path it has is the affiliate / IB fan-out, and it goes
 * over this client into svc-ledger through existing recipes.
 *
 * NARROWER THAN EVERY SIBLING, DELIBERATELY. The other services return a full
 * `LedgerClient`; this returns `Pick<LedgerClient, 'post'>`, because `post` is
 * the entire capability an affiliate payout needs. Handing identity `balance` /
 * `balances` would let a service that must never hold a balance start reading
 * the book, and the narrow type makes that a compile error rather than a
 * code-review question.
 *
 * Auth is body-bound (L2-6): serialize once, sign those bytes, send the same
 * string — a service-only signature is replayable against any post body.
 */
export function createLedgerClient(baseUrl: string, internalSecret: string): Pick<LedgerClient, 'post'> {
  const authHeaders = (payload: string) => serviceAuthHeadersForBody('svc-identity', internalSecret, payload);
  const url = baseUrl.replace(/\/$/, '');

  return {
    async post(request: PostRequest): Promise<LedgerTx> {
      const wire = {
        idempotencyKey: request.idempotencyKey,
        module: request.module,
        reason: request.reason,
        meta: request.meta ?? {},
        correlationId: request.correlationId,
        entries: request.entries.map((e) => ({
          account: e.account,
          direction: e.direction,
          // Decimal string on the wire; the scaled bigint never leaves the process.
          amount: formatAmount(e.amount),
        })),
      };

      const payload = JSON.stringify(wire);
      const res = await fetch(`${url}/trpc/post`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders(payload) },
        body: payload,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw rehydrateLedgerHttpError('/trpc/post', res.status, detail);
      }
      const result = (await res.json()) as { txId: string; hash: string; postedAt: string };

      return {
        id: result.txId,
        idempotencyKey: request.idempotencyKey,
        module: request.module,
        reason: request.reason,
        meta: request.meta ?? {},
        postedAt: new Date(result.postedAt),
        hash: result.hash,
        previousHash: null,
        entries: [],
      };
    },
  };
}
