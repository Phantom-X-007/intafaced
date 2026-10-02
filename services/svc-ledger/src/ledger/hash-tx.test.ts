import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { formatAmount, hashTx as memoryHash } from '@intafaced/ledger-client';
import { hashTx as postgresHash } from './postgres-ledger.js';

const postedAt = new Date('2026-01-01T00:00:00.000Z');
const tx = {
  id: '11111111-1111-4111-8111-111111111111',
  module: 'trade',
  reason: 'order.hold',
  postedAt,
  entries: [
    {
      id: 'entry-1',
      txId: '11111111-1111-4111-8111-111111111111',
      accountId: 'user:11111111-1111-4111-8111-111111111111:available:USDT',
      assetId: 'USDT',
      direction: 'debit' as const,
      amount: 100n * 10n ** 18n,
      balanceAfter: 0n,
    },
  ],
};

/** The byte already stored on ledger_tx.hash. Reconcile recomputes with this. */
function storedChainHash(): string {
  const canonical = JSON.stringify({
    id: tx.id,
    module: tx.module,
    reason: tx.reason,
    postedAt: postedAt.toISOString(),
    entries: tx.entries.map((e) => ({
      accountId: e.accountId,
      assetId: e.assetId,
      direction: e.direction,
      amount: formatAmount(e.amount),
    })),
  });
  return createHash('sha256').update('').update(' ').update(canonical).digest('hex');
}

describe('hashTx', () => {
  it('hashes one transaction the same in the memory book and in Postgres, with the stored space byte', () => {
    const stored = storedChainHash();
    expect(postgresHash(tx, null)).toBe(stored);
    expect(memoryHash(tx, null)).toBe(stored);
  });
});
