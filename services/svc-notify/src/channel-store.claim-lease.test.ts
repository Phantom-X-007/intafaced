import { describe, expect, it } from 'vitest';
import { MemoryDeliveryStore } from './channel-store.js';

/**
 * Delivery claim lease — two replicas must not both send while one is mid-flight.
 *
 * The unfixed MemoryDeliveryStore re-owned any pending row, so a concurrent
 * claim during an in-flight send produced a second gateway attempt.
 */

describe('MemoryDeliveryStore claim lease', () => {
  it('refuses a second claim while the first lease is live', async () => {
    let nowMs = 1_000_000;
    const store = new MemoryDeliveryStore({
      leaseMs: 60_000,
      now: () => new Date(nowMs),
    });

    const first = await store.claim('n1', 'email', 3);
    expect(first).toEqual({ claimed: true, id: expect.any(String), attempt: 1 });

    const second = await store.claim('n1', 'email', 3);
    expect(second.claimed).toBe(false);
    if (second.claimed) return;
    expect(second.reason).toBe('in_flight');
    expect(second.record.attempts).toBe(1);
  });

  it('allows reclaim after the lease expires (crash recovery)', async () => {
    let nowMs = 1_000_000;
    const store = new MemoryDeliveryStore({
      leaseMs: 60_000,
      now: () => new Date(nowMs),
    });

    const first = await store.claim('n2', 'email', 3);
    expect(first.claimed).toBe(true);

    nowMs += 60_001;
    const second = await store.claim('n2', 'email', 3);
    expect(second).toEqual({ claimed: true, id: (first as { id: string }).id, attempt: 2 });
  });

  it('allows reclaim after a settled retryable failure without waiting for lease', async () => {
    const store = new MemoryDeliveryStore({ leaseMs: 60_000 });
    const first = await store.claim('n3', 'email', 3);
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;

    await store.settle({ id: first.id, status: 'failed', attempted: true, detail: '503' });

    const second = await store.claim('n3', 'email', 3);
    expect(second).toEqual({ claimed: true, id: first.id, attempt: 2 });
  });

  it('still blocks redelivery after accept (no second send)', async () => {
    const store = new MemoryDeliveryStore();
    const first = await store.claim('n4', 'email', 3);
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    await store.settle({ id: first.id, status: 'accepted', attempted: true, reference: 'gw-1' });

    const second = await store.claim('n4', 'email', 3);
    expect(second.claimed).toBe(false);
    if (second.claimed) return;
    expect(second.reason).toBe('already_accepted');
  });
});
