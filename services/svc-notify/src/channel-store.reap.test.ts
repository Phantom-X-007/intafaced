import { describe, expect, it } from 'vitest';
import { MemoryDeliveryStore } from './channel-store.js';

/**
 * The delivery sweep — a row that is over must stop reading as "still trying".
 *
 * THE STATE THAT WAS UNREACHABLE BEFORE THIS EXISTED
 *
 * `abandoned` was written in one place only: the retire branch of `claim`,
 * which needs a LATER bus redelivery to run. `max_deliver` is 5 and
 * `NOTIFY_MAX_DELIVERY_ATTEMPTS` may be set as high as 5, so the delivery that
 * spends the last attempt can be the same one JetStream then parks. There is no
 * sixth message, `claim` is never called again, and the row stays `pending`.
 *
 * `notify.deliveries` is a user-facing screen — the README says so precisely
 * because the person whose collateral is at risk is the one who needs to know
 * whether the margin call reached them. `pending` on that screen means "still
 * being retried", and nothing was.
 */

const CRASHED_MID_SEND = 60_000;

describe('MemoryDeliveryStore.reapExhausted', () => {
  /** A store whose clock the test drives, so lease expiry is decided and not waited for. */
  function storeAt(startMs: number) {
    const clock = { now: startMs };
    const store = new MemoryDeliveryStore({ leaseMs: CRASHED_MID_SEND, now: () => new Date(clock.now) });
    return { store, clock };
  }

  it('retires a pending row whose last attempt was spent and whose sender died', async () => {
    const { store, clock } = storeAt(1_000_000);

    // Two attempts, both crashing mid-send: no settle, so the row stays pending
    // and is only reclaimable once its lease expires.
    expect((await store.claim('n1', 'email', 2)).claimed).toBe(true);
    clock.now += CRASHED_MID_SEND + 1;
    expect((await store.claim('n1', 'email', 2)).claimed).toBe(true);
    clock.now += CRASHED_MID_SEND + 1;

    // This is the parked state: attempts spent, lease dead, no further redelivery
    // coming. Before the sweep existed, nothing would ever change this row.
    const [before] = await store.listForNotification('n1');
    expect(before?.status).toBe('pending');
    expect(before?.attempts).toBe(2);

    expect(await store.reapExhausted(2)).toBe(1);

    const [after] = await store.listForNotification('n1');
    expect(after?.status).toBe('abandoned');
    expect(after?.refusalCode).toBe('channel.attempts_exhausted');
    expect(after?.leaseUntil).toBeNull();
    // The sweep reports a failure. It must never invent an outcome.
    expect(after?.acceptedAt).toBeNull();
  });

  it('retires a settled failure that has no attempts left', async () => {
    const { store } = storeAt(1_000_000);

    const claim = await store.claim('n2', 'sms', 1);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) return;
    await store.settle({ id: claim.id, status: 'failed', attempted: true, detail: '503' });

    // 'failed' says "will be tried again". At the attempt ceiling that is false.
    expect(await store.reapExhausted(1)).toBe(1);
    const [row] = await store.listForNotification('n2');
    expect(row?.status).toBe('abandoned');
  });

  it('never touches a row whose sender still holds the lease', async () => {
    const { store } = storeAt(1_000_000);

    // Attempt 2 of 2 is in flight right now — it may be about to be accepted.
    expect((await store.claim('n3', 'email', 2)).claimed).toBe(true);
    const record = (await store.listForNotification('n3'))[0]!;
    record.attempts = 2;

    expect(await store.reapExhausted(2)).toBe(0);
    expect((await store.listForNotification('n3'))[0]?.status).toBe('pending');
  });

  it('leaves a row that still has attempts left alone', async () => {
    const { store, clock } = storeAt(1_000_000);

    expect((await store.claim('n4', 'email', 3)).claimed).toBe(true);
    clock.now += CRASHED_MID_SEND + 1;

    // Dead lease, but the bus may still redeliver and this send may still work.
    // Abandoning it here would throw away a retry the user is owed.
    expect(await store.reapExhausted(3)).toBe(0);
    expect((await store.listForNotification('n4'))[0]?.status).toBe('pending');
  });

  it('never rewrites an accepted row', async () => {
    const { store } = storeAt(1_000_000);

    const claim = await store.claim('n5', 'email', 1);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) return;
    await store.settle({ id: claim.id, status: 'accepted', attempted: true, reference: 'gw-1' });

    expect(await store.reapExhausted(1)).toBe(0);
    expect((await store.listForNotification('n5'))[0]?.status).toBe('accepted');
  });

  it('is idempotent — a second sweep retires nothing', async () => {
    const { store } = storeAt(1_000_000);

    const claim = await store.claim('n6', 'push', 1);
    expect(claim.claimed).toBe(true);
    if (!claim.claimed) return;
    await store.settle({ id: claim.id, status: 'failed', attempted: true });

    expect(await store.reapExhausted(1)).toBe(1);
    expect(await store.reapExhausted(1)).toBe(0);
  });
});
