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
import { serviceAuthHeadersForBody } from '@intafaced/contracts';

/**
 * HTTP client for svc-ledger.
 *
 * §2: services never touch another service's tables. Every unit of P2P escrow
 * goes over this client into svc-ledger, which owns the balance graph —
 * svc-p2p holds no balances at all (Doctrine §0.6).
 *
 * It implements the same `LedgerClient` interface as `MemoryLedger`, which the
 * conformance suite proves equivalent to svc-ledger's Postgres engine (§4.4).
 * That equivalence is why the escrow money paths can be tortured in tests
 * without a network and still mean something.
 */
/** Map svc-ledger HTTP error bodies back to typed ledger errors (P2P-01). */
export function rehydrateLedgerHttpError(path: string, status: number, detail: string): Error {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(detail) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const code = typeof parsed?.code === 'string' ? parsed.code : null;
  const message = typeof parsed?.message === 'string' ? parsed.message : detail;
  const blob = `${code ?? ''} ${message} ${detail}`;

  if (status === 400 && (code === 'ledger.insufficient_funds' || /insufficient_funds|Insufficient \w+:/.test(blob))) {
    const assetId = typeof parsed?.assetId === 'string' ? parsed.assetId : 'UNKNOWN';
    const accountId = typeof parsed?.accountId === 'string' ? parsed.accountId : 'unknown';
    const requested = typeof parsed?.requested === 'string' ? parsed.requested : '0';
    const availableBalance = typeof parsed?.availableBalance === 'string' ? parsed.availableBalance : '0';
    // Prefer structured fields from s2s-http; fall back to message parse.
    const fromMsg = message.match(/Insufficient (\S+): requested (\S+), available (\S+)/);
    return new InsufficientFundsError(
      accountId,
      fromMsg?.[1] ?? assetId,
      (fromMsg?.[2] ?? requested) as `${string}`,
      (fromMsg?.[3] ?? availableBalance) as `${string}`,
    );
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
   *
   * It also covers the body (L2-6). Identity plus a timestamp left a captured
   * signature replayable against ANY body for 300 seconds — on this path, any
   * escrow lock or release.
   */
  const authHeaders = (payload: string) => serviceAuthHeadersForBody('svc-p2p', internalSecret, payload);

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
      // Rehydrate typed funds failure so p2p-service void-on-failed-lock runs
      // in production (MemoryLedger tests already throw InsufficientFundsError).
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

    /**
     * Not exposed over the internal ledger API.
     *
     * svc-p2p never needs it, and that is a design property rather than a
     * limitation: "did the escrow lock post?" is answered by *calling
     * `escrowLock` again*. The recipe's business key
     * (`p2p.escrow.lock:<tradeId>`) makes the retry return the original
     * transaction if it did, and fail on funds if it did not. Asking the ledger
     * a question is a round trip that can itself fail; re-driving the operation
     * converges either way.
     */
    async getTx(): Promise<LedgerTx | null> {
      throw new Error('getTx is not exposed over the internal ledger API — query svc-ledger directly');
    },

    async getTxByKey(): Promise<LedgerTx | null> {
      throw new Error('getTxByKey is not exposed over the internal ledger API — re-drive the idempotent recipe instead');
    },
  };
}
