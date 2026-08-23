import { formatAmount, type LedgerClient, type LedgerTx, type PostRequest } from '@intafaced/ledger-client';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';

/** The pool writes only through svc-ledger; it never owns a balance. */
export function createLedgerClient(baseUrl: string, internalSecret: string): Pick<LedgerClient, 'post'> {
  const url = baseUrl.replace(/\/$/, '');
  return {
    async post(request: PostRequest): Promise<LedgerTx> {
      const body = JSON.stringify({
        idempotencyKey: request.idempotencyKey,
        module: request.module,
        reason: request.reason,
        meta: request.meta ?? {},
        correlationId: request.correlationId,
        entries: request.entries.map((entry) => ({ ...entry, amount: formatAmount(entry.amount) })),
      });
      const response = await fetch(`${url}/trpc/post`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-mining-pool', internalSecret, body) },
        body,
      });
      if (!response.ok) throw new Error(`mining.ledger_post_failed:${response.status}`);
      const result = (await response.json()) as { txId: string; hash: string; postedAt: string };
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
