/**
 * Attach refuses unpublished WS_HIGH_WATER_BYTES.
 * Never invent 1048576.
 */
import { describe, expect, it } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';
import { CLOSE_POLICY, DepthHub, type DepthSink } from './depth/hub.js';
import { NativeL3Hub } from './depth/l3-hub.js';
import { DropCopyHub } from './drop-copy/hub.js';
import { isPublishedHighWaterBytes } from './high-water-bytes.js';
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
    throw new Error('depth must not run when high-water is unpublished');
  },
  async markets() {
    return [];
  },
};

describe('isPublishedHighWaterBytes', () => {
  it('unset / NaN / 0 refuse — never invent 1048576', () => {
    expect(isPublishedHighWaterBytes(undefined)).toBe(false);
    expect(isPublishedHighWaterBytes(Number.NaN)).toBe(false);
    expect(isPublishedHighWaterBytes(0)).toBe(false);
  });

  it('owner-published 1048576 is a lag buffer bound', () => {
    expect(isPublishedHighWaterBytes(1_048_576)).toBe(true);
  });
});

describe('attach unpublished WS_HIGH_WATER_BYTES', () => {
  it('depth hub refuses ws.close.high_water_bytes_unset before the seat ceiling', () => {
    const hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: undefined,
      maxLagTicks: 20,
      maxConnections: 10,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.highWaterBytesUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('trade hub refuses unpublished high-water', () => {
    const hub = new TradeHub({
      recentLimit: 10,
      highWaterBytes: undefined,
      maxLagTicks: 20,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.highWaterBytesUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('private hub refuses unpublished high-water', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: undefined,
      maxLagTicks: 20,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.highWaterBytesUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('drop-copy hub refuses unpublished high-water', () => {
    const hub = new DropCopyHub({
      recentLimit: 10,
      highWaterBytes: undefined,
      maxLagTicks: 20,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.highWaterBytesUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('native L3 hub refuses unpublished high-water', () => {
    const hub = new NativeL3Hub(source, {
      highWaterBytes: undefined,
      maxLagTicks: 20,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.highWaterBytesUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('owner-published 1048576 attaches', () => {
    const hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_048_576,
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
