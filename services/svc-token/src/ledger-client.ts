import {
  formatAmount,
  parseAmount,
  type AccountRef,
  type Balance,
  type LedgerClient,
  type LedgerTx,
  type PostRequest,
  rehydrateLedgerHttpError,
} from '@intafaced/ledger-client';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';

/**
 * HTTP client for svc-ledger.
 *
 * §2: services never touch another service's tables. svc-token moves a great
 * deal of value — staking, yield, emissions, burns — and every bit of it goes
 * over this client into svc-ledger, which owns the balance graph.
 *
 * It implements the same `LedgerClient` interface the in-memory reference and
 * the Postgres engine implement, so the money paths in `token-service.ts` are
 * written once and tested against the reference without a network.
 */
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
   *
   * It also covers the body (L2-6). Identity plus a timestamp left a captured
   * signature replayable against ANY body for 300 seconds — on this path, any
   * stake, unstake or epoch mint.
   */
  const authHeaders = (payload: string) => serviceAuthHeadersForBody('svc-token', internalSecret, payload);

  const url = baseUrl.replace(/\/$/, '');

  async function call<T>(path: string, body: unknown): Promise<T> {
    // Serialised ONCE, and the same string is both signed and sent. Signing
    // `JSON.stringify(body)` and then handing `body` to fetch to re-serialise
    // would digest bytes the server never sees; it presents as a 401 that
    // reproduces only under whatever key order the two calls happened to differ on.
    const payload = JSON.stringify(body);

    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(payload) },
      body: payload,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Preserve the ledger's own error text: 'ledger.insufficient_funds' and
      // 'ledger.frozen' mean very different things to a caller, and collapsing
      // them into "request failed" would make both unactionable.
      throw rehydrateLedgerHttpError(path, response.status, detail);
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
