/**
 * Attach refuses unpublished WS_MAX_LAG_TICKS.
 * Never invent 20.
 */
import { describe, expect, it } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';
import { CLOSE_POLICY, DepthHub, type DepthSink } from './depth/hub.js';
import { NativeL3Hub } from './depth/l3-hub.js';
import { DropCopyHub } from './drop-copy/hub.js';
import { isPublishedMaxLagTicks } from './max-lag-ticks.js';
import { PrivateOrderHub } from './private/hub.js';
import { TradeHub } from './trade/hub.js';

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
    throw new Error('depth must not run when lag ticks are unpublished');
  },
  async markets() {
    return [];
  },
};

describe('isPublishedMaxLagTicks', () => {
  it('unset / NaN / 0 refuse — never invent 20', () => {
    expect(isPublishedMaxLagTicks(undefined)).toBe(false);
    expect(isPublishedMaxLagTicks(Number.NaN)).toBe(false);
    expect(isPublishedMaxLagTicks(0)).toBe(false);
  });

  it('owner-published 20 is a lag bound', () => {
    expect(isPublishedMaxLagTicks(20)).toBe(true);
  });
});

describe('attach unpublished WS_MAX_LAG_TICKS', () => {
  it('depth hub refuses ws.close.max_lag_ticks_unset before the seat ceiling', () => {
    const hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: undefined,
      maxConnections: 10,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.maxLagTicksUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('trade hub refuses unpublished lag ticks', () => {
    const hub = new TradeHub({
      recentLimit: 10,
      highWaterBytes: 1_000,
      maxLagTicks: undefined,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.maxLagTicksUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('private hub refuses unpublished lag ticks', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: undefined,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.maxLagTicksUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('drop-copy hub refuses unpublished lag ticks', () => {
    const hub = new DropCopyHub({
      recentLimit: 10,
      highWaterBytes: 1_000,
      maxLagTicks: undefined,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.maxLagTicksUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('native L3 hub refuses unpublished lag ticks', () => {
    const hub = new NativeL3Hub(source, {
      highWaterBytes: 1_000,
      maxLagTicks: undefined,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.maxLagTicksUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('owner-published 20 attaches', () => {
    const hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 20,
      maxConnections: 10,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).not.toBeNull();
    expect(sink.closed).toBeNull();
    expect(hub.connections).toBe(1);
  });
});
