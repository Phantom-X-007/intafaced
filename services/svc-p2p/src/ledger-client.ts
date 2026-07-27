import {
  formatAmount,
  parseAmount,
  type AccountRef,
  type Balance,
  type LedgerClient,
  type LedgerTx,
  type PostRequest,
} from '@intafaced/ledger-client';

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
export function createLedgerClient(baseUrl: string): LedgerClient {
  const url = baseUrl.replace(/\/$/, '');

  async function call<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Preserve the ledger's own error text. `ledger.insufficient_funds` on an
      // escrow lock is the single most load-bearing distinction in this service
      // — it is how the take path knows the lock definitively did NOT post, and
      // therefore that there is nothing to refund.
      throw new Error(`svc-ledger ${path} failed (${response.status}): ${detail}`);
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
