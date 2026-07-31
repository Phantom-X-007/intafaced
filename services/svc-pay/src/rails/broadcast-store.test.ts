import { describe, expect, it } from 'vitest';
import { BROADCAST_PENDING, MemoryBroadcastStore, PostgresBroadcastStore, type BroadcastSql } from './broadcast-store.js';

/** In-process fake that mimics INSERT ON CONFLICT / SELECT / UPDATE for the journal. */
function fakePgSql(): BroadcastSql & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').toLowerCase();
    if (text.includes('insert into pay.crypto_broadcasts')) {
      const key = String(values[0]);
      const hash = String(values[1]);
      if (rows.has(key)) return [];
      rows.set(key, hash);
      return [{ idempotency_key: key }];
    }
    if (text.includes('update pay.crypto_broadcasts')) {
      const hash = String(values[0]);
      const key = String(values[1]);
      const pending = String(values[2]);
      const existing = rows.get(key);
      if (!existing) return [];
      if (existing === pending || existing === hash) {
        rows.set(key, hash);
        return [{ tx_hash: hash }];
      }
      return [];
    }
    if (text.includes('select tx_hash')) {
      const key = String(values[0]);
      const v = rows.get(key);
      return v === undefined ? [] : [{ tx_hash: v }];
    }
    throw new Error(`fakePgSql unhandled: ${text}`);
  }) as BroadcastSql & { rows: Map<string, string> };
  sql.rows = rows;
  return sql;
}

describe('MemoryBroadcastStore — Class M claim/put ordering', () => {
  it('gives exactly one concurrent claimer `mine`; others converge on the same hash', async () => {
    const store = new MemoryBroadcastStore();
    const kinds: string[] = [];

    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.claim('payout:w1:1').then(async (claim) => {
          kinds.push(claim.kind);
          if (claim.kind === 'mine') {
            await store.put('payout:w1:1', '0xabc');
          } else {
            expect(claim.txHash).toBe('0xabc');
          }
        }),
      ),
    );

    expect(kinds.filter((k) => k === 'mine')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'done')).toHaveLength(7);
    expect(await store.get('payout:w1:1')).toBe('0xabc');
  });

  it('put never overwrites a settled hash', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('k');
    expect(await store.put('k', '0xfirst')).toBe('0xfirst');
    expect(await store.put('k', '0xsecond')).toBe('0xfirst');
    expect(await store.get('k')).toBe('0xfirst');
  });

  it('get hides the pending sentinel', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('k');
    expect(await store.get('k')).toBeNull();
    expect(BROADCAST_PENDING).toBe('__pending__');
  });

  it('refuses to put the pending sentinel as a txHash', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('k');
    await expect(store.put('k', BROADCAST_PENDING)).rejects.toThrow(/pending sentinel/);
  });

  it('after put, a new claimer is done with the same hash (retry-safe same process)', async () => {
    const store = new MemoryBroadcastStore();
    const first = await store.claim('refund:p1:1');
    expect(first.kind).toBe('mine');
    await store.put('refund:p1:1', '0xhash1');
    const second = await store.claim('refund:p1:1');
    expect(second).toEqual({ kind: 'done', txHash: '0xhash1' });
  });

  it('reset clears journal — documents single-process crash residual (M226-01)', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('payout:w2:1');
    await store.put('payout:w2:1', '0xsent');
    store.reset();
    // After process death equivalent, same business key is claimable again —
    // multi-replica / crash residual: a second broadcast can mine.
    const again = await store.claim('payout:w2:1');
    expect(again.kind).toBe('mine');
  });
});

describe('PostgresBroadcastStore — Class M claim/put (fake SQL)', () => {
  it('gives exactly one concurrent claimer mine; others get done with same hash', async () => {
    const sql = fakePgSql();
    const store = new PostgresBroadcastStore(sql, { pollMs: 5, maxWaits: 40 });
    const kinds: string[] = [];

    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.claim('payout:w1:1').then(async (claim) => {
          kinds.push(claim.kind);
          if (claim.kind === 'mine') {
            await store.put('payout:w1:1', '0xabc');
          } else {
            expect(claim.txHash).toBe('0xabc');
          }
        }),
      ),
    );

    expect(kinds.filter((k) => k === 'mine')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'done')).toHaveLength(7);
    expect(await store.get('payout:w1:1')).toBe('0xabc');
  });

  it('put never overwrites a settled hash', async () => {
    const store = new PostgresBroadcastStore(fakePgSql());
    await store.claim('k');
    expect(await store.put('k', '0xfirst')).toBe('0xfirst');
    expect(await store.put('k', '0xsecond')).toBe('0xfirst');
    expect(await store.get('k')).toBe('0xfirst');
  });

  it('survives process-equivalent restart (rows stay) — multi-replica residual closed', async () => {
    const sql = fakePgSql();
    const a = new PostgresBroadcastStore(sql);
    await a.claim('payout:w3:1');
    await a.put('payout:w3:1', '0xsent');
    const b = new PostgresBroadcastStore(sql);
    const again = await b.claim('payout:w3:1');
    expect(again).toEqual({ kind: 'done', txHash: '0xsent' });
  });
});
