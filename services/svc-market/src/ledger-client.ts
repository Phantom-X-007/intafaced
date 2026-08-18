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
 * HTTP client for svc-ledger — market.commerce money path only.
 *
 * §0.6 / §2: no balances stored in market; every purchase posts a recipe.
 * Body-bound service auth matches svc-bank / svc-token (T-04).
 */
export function createLedgerClient(baseUrl: string, internalSecret: string): LedgerClient {
  const authHeaders = (payload: string) => serviceAuthHeadersForBody('svc-market', internalSecret, payload);
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
          amount: formatAmount(e.amount),
        })),
      };

      const result = await call<{ txId: string; hash: string; postedAt: string }>(url, '/trpc/post', wire, authHeaders);

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
      const result = await call<{ accountId: string; amount: string }>(url, '/trpc/balance', ref, authHeaders);
      return { account: ref, accountId: result.accountId, amount: parseAmount(result.amount) };
    },

    async balances(ownerType: AccountRef['ownerType'], ownerId: string): Promise<Balance[]> {
      const result = await call<Array<{ accountId: string; assetId: string; kind: string; amount: string }>>(
        url,
        '/trpc/balances',
        { ownerType, ownerId },
        authHeaders,
      );
      return result.map((b) => ({
        account: { ownerType, ownerId, assetId: b.assetId, kind: b.kind as AccountRef['kind'] },
        accountId: b.accountId,
        amount: parseAmount(b.amount),
      }));
    },

    async getTx(): Promise<LedgerTx | null> {
      throw new Error('getTx is not exposed over the internal ledger API');
    },

    async getTxByKey(): Promise<LedgerTx | null> {
      throw new Error('getTxByKey is not exposed over the internal ledger API');
    },
  };
}

async function call<T>(
  baseUrl: string,
  path: string,
  input: unknown,
  authHeaders: (payload: string) => Record<string, string>,
): Promise<T> {
  const payload = JSON.stringify(input);
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(payload) },
    body: payload,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw rehydrateLedgerHttpError(path, res.status, detail);
  }
  return (await res.json()) as T;
}
