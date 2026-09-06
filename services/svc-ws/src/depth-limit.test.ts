/**
 * Attach / poll refuse unpublished WS_DEPTH_LIMIT.
 * Never invent 50.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';
import { CLOSE_POLICY, DepthHub, type DepthSink } from './depth/hub.js';
import { NativeL3Hub } from './depth/l3-hub.js';
import { DepthPoller } from './depth/poller.js';
import { isPublishedDepthLimit, windowDepthSnapshot, windowNativeL3Queue } from './depth-limit.js';

class FakeSink implements DepthSink {
  readonly frames: string[] = [];
  closed: { code: number; reason: string } | null = null;
  bufferedBytes = 0;
  send(frame: string): void {
    this.frames.push(frame);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}

const source = {
  async snapshot() {
    throw new Error('depth must not run when window is unpublished');
  },
  async markets() {
    return [];
  },
};

describe('isPublishedDepthLimit', () => {
  it('unset / NaN / 0 / 501 refuse — never invent 50', () => {
    expect(isPublishedDepthLimit(undefined)).toBe(false);
    expect(isPublishedDepthLimit(Number.NaN)).toBe(false);
    expect(isPublishedDepthLimit(0)).toBe(false);
    expect(isPublishedDepthLimit(501)).toBe(false);
  });

  it('owner-published 50 is a window', () => {
    expect(isPublishedDepthLimit(50)).toBe(true);
  });
});

describe('windowDepthSnapshot', () => {
  it('slices bids desc and asks asc to the published window — never 20/50', () => {
    const windowed = windowDepthSnapshot(
      {
        type: 'snapshot',
        marketId: 'm-1',
        sequence: 9,
        bids: [
          ['98', '1'],
          ['100', '3'],
          ['99', '2'],
        ],
        asks: [
          ['103', '3'],
          ['101', '1'],
          ['102', '2'],
        ],
      },
      2,
    );
    expect(windowed.bids).toEqual([
      ['100', '3'],
      ['99', '2'],
    ]);
    expect(windowed.asks).toEqual([
      ['101', '1'],
      ['102', '2'],
    ]);
    expect(windowed.sequence).toBe(9);
  });
});

describe('windowNativeL3Queue', () => {
  it('slices native price levels bids desc and asks asc — never 20/50', () => {
    const windowed = windowNativeL3Queue(
      {
        level: 'L3',
        marketId: 'm-1',
        bids: [
          { price: '98', orders: [{ orderId: 'b3', remaining: '1', sequence: 1 }] },
          { price: '100', orders: [{ orderId: 'b1', remaining: '3', sequence: 2 }] },
          { price: '99', orders: [{ orderId: 'b2', remaining: '2', sequence: 3 }] },
        ],
        asks: [
          { price: '103', orders: [{ orderId: 'a3', remaining: '3', sequence: 4 }] },
          { price: '101', orders: [{ orderId: 'a1', remaining: '1', sequence: 5 }] },
          { price: '102', orders: [{ orderId: 'a2', remaining: '2', sequence: 6 }] },
        ],
      },
      2,
    );
    expect(windowed.bids.map((l) => l.price)).toEqual(['100', '99']);
    expect(windowed.asks.map((l) => l.price)).toEqual(['101', '102']);
    expect(windowed.bids[0]!.orders).toEqual([{ orderId: 'b1', remaining: '3', sequence: 2 }]);
  });
});

describe('attach unpublished WS_DEPTH_LIMIT', () => {
  it('depth hub refuses ws.close.depth_limit_unset before the seat ceiling', () => {
    const hub = new DepthHub(source, {
      depthLimit: undefined,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.depthLimitUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('owner-published 50 attaches', () => {
    const hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).not.toBeNull();
    expect(sink.closed).toBeNull();
    expect(hub.connections).toBe(1);
  });

  it('native L3 hub refuses ws.close.depth_limit_unset before the seat ceiling', () => {
    const hub = new NativeL3Hub(source, {
      depthLimit: undefined,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.depthLimitUnset),
    });
    expect(hub.connections).toBe(0);
  });
});

describe('poll unpublished WS_DEPTH_LIMIT', () => {
  it('does not invent 50 on tick even when a seat is already open', async () => {
    const snap = vi.fn(async (marketId: string) => ({
      type: 'snapshot' as const,
      marketId,
      sequence: 1,
      bids: [['100', '1']] as const,
      asks: [['101', '1']] as const,
    }));
    const polled = {
      snapshot: snap,
      async markets() {
        return ['m-1'];
      },
    };
    const hub = new DepthHub(polled, {
      depthLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterSeed = snap.mock.calls.length;
    expect(afterSeed).toBeGreaterThan(0);
    const poller = new DepthPoller(
      polled,
      hub,
      { intervalMs: 1_000, depthLimit: undefined, marketsRefreshMs: 30_000 },
      { info: vi.fn(), warn: vi.fn() },
    );
    await poller.tick();
    expect(snap.mock.calls.length).toBe(afterSeed);
  });
});
