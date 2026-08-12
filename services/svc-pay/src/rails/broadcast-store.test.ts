import { describe, expect, it } from 'vitest';
import { BROADCAST_PENDING, MemoryBroadcastStore, PostgresBroadcastStore, type BroadcastSql } from './broadcast-store.js';

/** In-process fake that mimics INSERT ON CONFLICT / SELECT / UPDATE for the journal. */
function fakePgSql(): BroadcastSql & {
  rows: Map<string, { tx_hash: string; signed_raw: string | null }>;
} {
  const rows = new Map<string, { tx_hash: string; signed_raw: string | null }>();
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').toLowerCase();
    if (text.includes('insert into pay.crypto_broadcasts')) {
      const key = String(values[0]);
      const hash = String(values[1]);
      if (rows.has(key)) return [];
      rows.set(key, { tx_hash: hash, signed_raw: null });
      return [{ idempotency_key: key }];
    }
    if (text.includes('set signed_raw')) {
      const signedRaw = String(values[0]);
      const key = String(values[1]);
      const pending = String(values[2]);
      const existing = rows.get(key);
      if (!existing) return [];
      if (existing.tx_hash !== pending) return [];
      if (existing.signed_raw !== null && existing.signed_raw !== signedRaw) return [];
      existing.signed_raw = signedRaw;
      return [{ idempotency_key: key }];
    }
    if (text.includes('update pay.crypto_broadcasts') && text.includes('set tx_hash')) {
      const hash = String(values[0]);
      const key = String(values[1]);
      const pending = String(values[2]);
      const existing = rows.get(key);
      if (!existing) return [];
      if (existing.tx_hash === pending || existing.tx_hash === hash) {
        existing.tx_hash = hash;
        return [{ tx_hash: hash }];
      }
      return [];
    }
    if (text.includes('select tx_hash, signed_raw')) {
      const key = String(values[0]);
      const v = rows.get(key);
      return v === undefined ? [] : [{ tx_hash: v.tx_hash, signed_raw: v.signed_raw }];
    }
    if (text.includes('select tx_hash')) {
      const key = String(values[0]);
      const v = rows.get(key);
      return v === undefined ? [] : [{ tx_hash: v.tx_hash }];
    }
    throw new Error(`fakePgSql unhandled: ${text}`);
  }) as unknown as BroadcastSql & { rows: Map<string, { tx_hash: string; signed_raw: string | null }> };
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
            await store.putSigned('payout:w1:1', '0xraw');
            await store.put('payout:w1:1', '0xabc');
          } else if (claim.kind === 'resume') {
            expect(claim.signedRaw).toBe('0xraw');
            await store.put('payout:w1:1', '0xabc');
          } else {
            expect(claim.txHash).toBe('0xabc');
          }
        }),
      ),
    );

    expect(kinds.filter((k) => k === 'mine')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'done' || k === 'resume').length).toBe(7);
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
    await store.putSigned('refund:p1:1', '0xraw1');
    await store.put('refund:p1:1', '0xhash1');
    const second = await store.claim('refund:p1:1');
    expect(second).toEqual({ kind: 'done', txHash: '0xhash1' });
  });

  it('putSigned then crash-equivalent claim resumes the same signed raw (D26-P1-P9)', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('payout:resume:1');
    await store.putSigned('payout:resume:1', '0xsignedbytes');
    // Hash never journalled — process died after broadcast RPC.
    const again = await store.claim('payout:resume:1');
    expect(again).toEqual({ kind: 'resume', signedRaw: '0xsignedbytes' });
  });

  it('putSigned refuses a mismatched signed payload', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('k');
    await store.putSigned('k', '0xaaa');
    await expect(store.putSigned('k', '0xbbb')).rejects.toThrow(/mismatch/);
  });

  it('reset clears journal — documents single-process crash residual (M226-01)', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('payout:w2:1');
    await store.putSigned('payout:w2:1', '0xraw');
    await store.put('payout:w2:1', '0xsent');
    store.reset();
    // After process death equivalent, same business key is claimable again —
    // MemoryBroadcastStore is not durable across process boundaries.
    const again = await store.claim('payout:w2:1');
    expect(again.kind).toBe('mine');
  });
});

describe('PostgresBroadcastStore — Class M claim/put (fake SQL)', () => {
  it('gives exactly one concurrent claimer mine; others get done/resume with same hash', async () => {
    const sql = fakePgSql();
    const store = new PostgresBroadcastStore(sql, { pollMs: 5, maxWaits: 40 });
    const kinds: string[] = [];

    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.claim('payout:w1:1').then(async (claim) => {
          kinds.push(claim.kind);
          if (claim.kind === 'mine') {
            await store.putSigned('payout:w1:1', '0xraw');
            await store.put('payout:w1:1', '0xabc');
          } else if (claim.kind === 'resume') {
            expect(claim.signedRaw).toBe('0xraw');
            await store.put('payout:w1:1', '0xabc');
          } else {
            expect(claim.txHash).toBe('0xabc');
          }
        }),
      ),
    );

    expect(kinds.filter((k) => k === 'mine')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'done' || k === 'resume').length).toBe(7);
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
    await a.putSigned('payout:w3:1', '0xraw');
    await a.put('payout:w3:1', '0xsent');
    const b = new PostgresBroadcastStore(sql);
    const again = await b.claim('payout:w3:1');
    expect(again).toEqual({ kind: 'done', txHash: '0xsent' });
  });

  it('crash after putSigned before put → resume same signed raw across store instances', async () => {
    const sql = fakePgSql();
    const a = new PostgresBroadcastStore(sql, { pollMs: 5, maxWaits: 40 });
    await a.claim('payout:w4:1');
    await a.putSigned('payout:w4:1', '0xsigned-resume');
    // No put — crash window that D26-P1-P9 closes.
    const b = new PostgresBroadcastStore(sql, { pollMs: 5, maxWaits: 40 });
    const again = await b.claim('payout:w4:1');
    expect(again).toEqual({ kind: 'resume', signedRaw: '0xsigned-resume' });
  });
});
