import { describe, expect, it } from 'vitest';
import { BROADCAST_PENDING, MemoryBroadcastStore } from './broadcast-store.js';

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
