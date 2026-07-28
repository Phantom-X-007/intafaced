import { describe, expect, it, vi } from 'vitest';
import type { DepthDelta, DepthMessage, DepthSnapshot } from '@intafaced/market-data';
import { DepthController, type DepthState, type DepthTransport } from './depth-controller';
import { resolveDepthTransport } from './depth-source';

/**
 * The gap contract, from the client side.
 *
 * `@intafaced/market-data` already proves that `applyDelta` REFUSES a delta that
 * does not continue the book. What it cannot prove is that anybody listens. A
 * client that receives `{ ok: false, reason: 'gap' }` and carries on rendering
 * the last book is precisely the bug the package was written to prevent, and it
 * is a bug that lives here, not there. So these are the tests that matter:
 *
 *   · a gap must cause a resnapshot, and
 *   · a gapped book must not stay on screen while that happens.
 */

const MARKET = 'BTC-USDT';

function snapshot(sequence: number, bids: [string, string][] = [['100', '1']], asks: [string, string][] = [['101', '1']]): DepthSnapshot {
  return { type: 'snapshot', marketId: MARKET, sequence, bids, asks };
}

function delta(fromSequence: number, sequence: number, bids: [string, string][] = [], asks: [string, string][] = []): DepthDelta {
  return { type: 'delta', marketId: MARKET, fromSequence, sequence, bids, asks };
}

/** A transport under the test's control: nothing resolves until it is told to. */
function harness(snapshots: DepthSnapshot[]) {
  const queue = [...snapshots];
  let push: ((m: DepthMessage) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;
  const snapshotCalls: number[] = [];

  const transport: DepthTransport = {
    async snapshot() {
      snapshotCalls.push(Date.now());
      const next = queue.shift();
      if (!next) throw new Error('snapshot endpoint exhausted');
      return next;
    },
    subscribe(_marketId, onMessage, onError) {
      push = onMessage;
      fail = onError;
      return () => {
        push = null;
        fail = null;
      };
    },
  };

  const states: DepthState[] = [];
  const controller = new DepthController({ marketId: MARKET, transport });
  controller.subscribe((s) => states.push(s));

  return {
    controller,
    states,
    snapshotCount: () => snapshotCalls.length,
    send: (m: DepthMessage) => push?.(m),
    error: (e: Error) => fail?.(e),
    /** Let the snapshot promise settle. */
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe('DepthController — the book only ever shows what it can prove', () => {
  it('goes live on the first snapshot and advances on in-sequence deltas', async () => {
    const h = harness([snapshot(10)]);
    h.controller.start();
    await h.settle();

    expect(h.controller.state.status).toBe('live');

    h.send(delta(10, 11, [['100', '2']]));
    const state = h.controller.state;
    expect(state.status).toBe('live');
    if (state.status !== 'live') throw new Error('unreachable');
    expect(state.book.sequence).toBe(11);
    expect(state.book.bids.get('100')).toBe(2n * 10n ** 18n);
    expect(h.snapshotCount()).toBe(1);
  });

  /** THE TEST THIS MODULE EXISTS FOR. */
  it('resnapshots on a gap instead of applying the delta', async () => {
    const h = harness([snapshot(10), snapshot(30, [['100', '9']])]);
    h.controller.start();
    await h.settle();

    // Sequence 11 never arrived. This one continues from 11, the book is at 10.
    h.send(delta(11, 12, [['100', '7']]));

    // Before the new snapshot lands, the book is NOT being served.
    expect(h.controller.state.status).toBe('resnapshotting');
    expect(h.snapshotCount()).toBe(2);

    await h.settle();
    const state = h.controller.state;
    expect(state.status).toBe('live');
    if (state.status !== 'live') throw new Error('unreachable');
    expect(state.book.sequence).toBe(30);
    // The gapping delta's quantity must NOT be in the book — it was refused.
    expect(state.book.bids.get('100')).toBe(9n * 10n ** 18n);
    expect(state.resnapshots).toBe(1);
  });

  it('never leaves a stale book on screen while it resnapshots', async () => {
    const h = harness([snapshot(10), snapshot(30)]);
    h.controller.start();
    await h.settle();
    h.send(delta(11, 12));

    // No emitted state between the gap and the new snapshot may carry a book.
    const duringGap = h.states.filter((s) => s.status === 'resnapshotting');
    expect(duringGap.length).toBeGreaterThan(0);
    for (const s of duringGap) expect('book' in s).toBe(false);
  });

  it('ignores a re-delivered (stale) delta without resnapshotting', async () => {
    const h = harness([snapshot(10)]);
    h.controller.start();
    await h.settle();

    h.send(delta(10, 11, [['100', '5']]));
    h.send(delta(10, 11, [['100', '5']])); // exactly the same frame again

    expect(h.controller.state.status).toBe('live');
    expect(h.snapshotCount()).toBe(1);
  });

  it('ignores another market’s stream', async () => {
    const h = harness([snapshot(10)]);
    h.controller.start();
    await h.settle();

    h.send({ type: 'delta', marketId: 'ETH-USDT', fromSequence: 10, sequence: 11, bids: [], asks: [] });

    const state = h.controller.state;
    if (state.status !== 'live') throw new Error('expected live');
    expect(state.book.sequence).toBe(10);
    expect(h.snapshotCount()).toBe(1);
  });

  it('applies deltas that arrived while the snapshot was in flight', async () => {
    const h = harness([snapshot(10)]);
    h.controller.start();

    // Stream is ahead of the snapshot round trip.
    h.send(delta(10, 11, [['100', '3']]));
    h.send(delta(11, 12, [['100', '4']]));
    await h.settle();

    const state = h.controller.state;
    if (state.status !== 'live') throw new Error('expected live');
    expect(state.book.sequence).toBe(12);
    expect(state.book.bids.get('100')).toBe(4n * 10n ** 18n);
  });

  it('discards buffered deltas the snapshot already contains', async () => {
    const h = harness([snapshot(20, [['100', '8']])]);
    h.controller.start();

    h.send(delta(9, 10, [['100', '1']])); // long superseded
    await h.settle();

    const state = h.controller.state;
    if (state.status !== 'live') throw new Error('expected live');
    expect(state.book.sequence).toBe(20);
    expect(state.book.bids.get('100')).toBe(8n * 10n ** 18n);
  });

  it('reports unavailable rather than throwing when the snapshot fails', async () => {
    const h = harness([]); // the endpoint throws
    h.controller.start();
    await h.settle();

    const state = h.controller.state;
    expect(state.status).toBe('unavailable');
    if (state.status !== 'unavailable') throw new Error('unreachable');
    expect(state.reason).toContain('exhausted');
  });

  it('gives up loudly rather than resnapshotting forever', async () => {
    // Every snapshot lands at 10; every delta continues from 50. Never joins.
    const h = harness([snapshot(10), snapshot(10), snapshot(10), snapshot(10), snapshot(10), snapshot(10), snapshot(10)]);
    h.controller.start();
    await h.settle();

    for (let i = 0; i < 8; i += 1) {
      h.send(delta(50 + i, 51 + i));
      await h.settle();
    }

    expect(h.controller.state.status).toBe('unavailable');
  });

  it('surfaces a transport error as unavailable', async () => {
    const h = harness([snapshot(10)]);
    h.controller.start();
    await h.settle();

    h.error(new Error('stream closed by peer'));

    const state = h.controller.state;
    expect(state.status).toBe('unavailable');
    if (state.status !== 'unavailable') throw new Error('unreachable');
    expect(state.reason).toBe('stream closed by peer');
  });

  it('stops cleanly: no state changes after stop()', async () => {
    const h = harness([snapshot(10)]);
    h.controller.start();
    await h.settle();

    const before = h.states.length;
    h.controller.stop();
    h.send(delta(10, 11));
    expect(h.states.length).toBe(before);
  });
});

describe('the depth socket is declared, not faked', () => {
  /**
   * If a transport ever becomes available this test fails, which is the point:
   * it forces whoever wires it to also delete the socket copy in the UI rather
   * than leave the terminal telling users the book is unavailable when it is
   * not.
   */
  it('reports no live transport, with a reason a user can read', () => {
    const availability = resolveDepthTransport();
    expect(availability.available).toBe(false);
    if (availability.available) throw new Error('unreachable');
    expect(availability.reason).toMatch(/svc-matching/);
    expect(availability.blockedBy).toContain('ws.gateway');
  });

  it('does not read an environment variable to conjure one', () => {
    const spy = vi.spyOn(process, 'env', 'get');
    resolveDepthTransport();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
