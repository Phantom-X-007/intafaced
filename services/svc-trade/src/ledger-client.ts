import {
  formatAmount,
  parseAmount,
  InsufficientFundsError,
  type AccountRef,
  type Balance,
  type LedgerClient,
  type LedgerTx,
  type PostRequest,
} from '@intafaced/ledger-client';
import { serviceAuthHeaders } from '@intafaced/contracts';

/**
 * HTTP client for svc-ledger.
 *
 * §2: services never touch another service's tables. Every hold, every fill and
 * every release this service performs goes over this client into svc-ledger,
 * which owns the balance graph — this service owns none of it (Doctrine §0.6).
 *
 * It implements the same `LedgerClient` interface the in-memory reference and
 * the Postgres engine implement, so the money paths in `spot/trade-service.ts`
 * are written once and tested against the reference without a network.
 */
/**
 * Rebuild the ledger's own typed error from the wire.
 *
 * ── Why this is not cosmetic ────────────────────────────────────────────────
 *
 * `toTrpcError` in `router.ts` branches on `err instanceof
 * InsufficientFundsError` to answer BAD_REQUEST, with a comment explaining that
 * `ledger.insufficient_funds` must not look retryable. This client used to
 * throw a plain `Error`, which is not an instance of anything the router knows,
 * so a user who could not afford an order got **500 INTERNAL_SERVER_ERROR**
 * from the live fleet — the most retryable class there is, and the exact
 * opposite of the documented contract.
 *
 * The in-process ledger the unit tests use throws the typed error directly, so
 * every test agreed with the comment while the deployed platform did not. Found
 * by `tooling/e2e/src/failure-paths.e2e.test.ts`.
 *
 * `code` is the signal, not the status: 400 is also what a malformed request
 * returns, and "you cannot afford this" is a different answer to the user.
 *
 * ── Deliberately only ONE code is translated ────────────────────────────────
 *
 * `toTrpcError` maps any `LedgerError` to BAD_REQUEST, so translating every
 * code here would quietly turn `ledger.frozen` — an operator having stopped the
 * book, which is neither the caller's fault nor permanent — into a 400 telling
 * the user their request was bad. Today it is a 500, which is at least honest
 * about whose problem it is and stays retryable. Widening this map means
 * deciding the right tRPC class for each ledger code, and that is an argument
 * with its own PR, not a side effect of fixing insufficient funds.
 *
 * Everything unrecognised therefore stays a plain `Error` and a 500 — the same
 * behaviour as before this function existed.
 */
function toLedgerError(path: string, status: number, detail: string): Error {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body = JSON.parse(detail) as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Not JSON — fall through to the generic error below, with the text intact.
  }

  if (code === 'ledger.insufficient_funds') {
    // The wire body carries the ledger's message, which already names the asset
    // and both amounts. The structured fields are not on the wire, so they are
    // reconstructed as unknown rather than invented — nothing reads them on this
    // path, and a fabricated balance in an error object is a number somebody
    // will eventually believe.
    const err = new InsufficientFundsError('unknown', 'unknown', '0', '0');
    err.message = message ?? err.message;
    return err;
  }

  return new Error(`svc-ledger ${path} failed (${status}): ${detail}`);
}

export function createLedgerClient(baseUrl: string, internalSecret: string): LedgerClient {
  /**
   * Service credentials, per call (§2).
   *
   * svc-ledger's `post` is a `serviceProcedure` now, so this client must prove
   * which service it is. It previously sent `content-type` and nothing else —
   * there was no credential to check even before `post` began checking.
   *
   * Signed per request rather than once at construction, because the signature
   * covers a timestamp: a captured header stops working after the skew window
   * instead of being a permanent bearer token.
   */
  const authHeaders = () => serviceAuthHeaders('svc-trade', internalSecret);

  const url = baseUrl.replace(/\/$/, '');

  async function call<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Preserve the ledger's own error text: 'ledger.insufficient_funds' and
      // 'ledger.frozen' mean very different things to a caller — the first is a
      // user who cannot afford an order, the second is a book that has stopped
      // accepting writes — and collapsing them into "request failed" would make
      // both unactionable.
      throw toLedgerError(path, response.status, detail);
    }

    return (await response.json()) as T;
  }

  return {
    async post(request: PostRequest): Promise<LedgerTx> {
      // Amounts cross the wire as decimal strings — never as JS numbers, and
      // never as bigint (which JSON cannot represent).
      const wire = {
        idempotencyKey: request.idempotencyKey,
        module: request.module,
        reason: request.reason,
        meta: request.meta ?? {},
        correlationId: request.correlationId,
        entries: request.entries.map((e) => ({
          account: e.account,
          direction: e.direction,
          amount: formatAmount(e.amount),
        })),
      };

      const result = await call<{ txId: string; hash: string; postedAt: string }>('/trpc/post', wire);

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

    async balance(ref: AccountRef): Promise<Balance> {
      const result = await call<{ accountId: string; amount: string }>('/trpc/balance', ref);
      return { account: ref, accountId: result.accountId, amount: parseAmount(result.amount) };
    },

    async balances(ownerType: AccountRef['ownerType'], ownerId: string): Promise<Balance[]> {
      const result = await call<Array<{ accountId: string; assetId: string; kind: string; amount: string }>>('/trpc/balances', {
        ownerType,
        ownerId,
      });

      return result.map((b) => ({
        account: { ownerType, ownerId, assetId: b.assetId, kind: b.kind as AccountRef['kind'] },
        accountId: b.accountId,
        amount: parseAmount(b.amount),
      }));
    },

    async getTx(): Promise<LedgerTx | null> {
      throw new Error('getTx is not exposed over the internal ledger API — query svc-ledger directly');
    },

    async getTxByKey(): Promise<LedgerTx | null> {
      throw new Error('getTxByKey is not exposed over the internal ledger API — query svc-ledger directly');
    },
  };
}
