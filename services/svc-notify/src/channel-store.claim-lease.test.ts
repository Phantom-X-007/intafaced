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

    await store.settle({ id: first.id, attempt: first.attempt, status: 'failed', attempted: true, detail: '503' });

    const second = await store.claim('n3', 'email', 3);
    expect(second).toEqual({ claimed: true, id: first.id, attempt: 2 });
  });

  it('still blocks redelivery after accept (no second send)', async () => {
    const store = new MemoryDeliveryStore();
    const first = await store.claim('n4', 'email', 3);
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;
    await store.settle({ id: first.id, attempt: first.attempt, status: 'accepted', attempted: true, reference: 'gw-1' });

    const second = await store.claim('n4', 'email', 3);
    expect(second.claimed).toBe(false);
    if (second.claimed) return;
    expect(second.reason).toBe('already_accepted');
  });

  it('a late settle from a reclaimed attempt cannot stamp accepted over attempt N+1', async () => {
    // Unit card — multi-replica late gateway after reclaim
    // 1. Promise: ≤1 honest status writer per (notification, channel) attempt
    // 2. Break: settle WHERE id only → first attempt's late 2xx overwrites reclaim
    // 3. Done bar: first settle no-ops; second attempt still owns the row
    let nowMs = 1_000_000;
    const store = new MemoryDeliveryStore({
      leaseMs: 60_000,
      now: () => new Date(nowMs),
    });

    const first = await store.claim('n5', 'sms', 3);
    expect(first.claimed).toBe(true);
    if (!first.claimed) return;

    nowMs += 60_001;
    const second = await store.claim('n5', 'sms', 3);
    expect(second.claimed).toBe(true);
    if (!second.claimed) return;
    expect(second).toEqual({ claimed: true, id: first.id, attempt: 2 });

    // Late response from attempt 1 — must not invent accepted for the live claim.
    await store.settle({
      id: first.id,
      attempt: first.attempt,
      status: 'accepted',
      attempted: true,
      reference: 'late-gw',
    });

    const mid = (await store.listForNotification('n5'))[0]!;
    expect(mid.status).toBe('pending');
    expect(mid.attempts).toBe(2);
    expect(mid.acceptedAt).toBeNull();
    expect(mid.reference).toBeNull();

    await store.settle({
      id: second.id,
      attempt: second.attempt,
      status: 'accepted',
      attempted: true,
      reference: 'live-gw',
    });
    const done = (await store.listForNotification('n5'))[0]!;
    expect(done).toMatchObject({ status: 'accepted', attempts: 2, reference: 'live-gw' });
  });

  it('does not abandon a final attempt while its lease is still live', async () => {
    const store = new MemoryDeliveryStore({ leaseMs: 60_000 });
    const first = await store.claim('n6', 'email', 1);
    expect(first.claimed).toBe(true);

    // Ceiling already spent on the live claim — reclaim must say in_flight, not abandon.
    const second = await store.claim('n6', 'email', 1);
    expect(second.claimed).toBe(false);
    if (second.claimed) return;
    expect(second.reason).toBe('in_flight');
    expect(second.record.status).toBe('pending');
  });
});
