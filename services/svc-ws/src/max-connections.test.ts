/**
 * Attach refuses unpublished WS_MAX_CONNECTIONS / per-user cap.
 * Never invent 5000 or 16.
 */
import { describe, expect, it } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';
import { CLOSE_POLICY, DepthHub, type DepthSink } from './depth/hub.js';
import { DropCopyHub } from './drop-copy/hub.js';
import { isPublishedConnectionCeiling } from './max-connections.js';
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
  async depth() {
    throw new Error('depth must not run when ceiling is unpublished');
  },
  async markets() {
    return [];
  },
};

describe('isPublishedConnectionCeiling', () => {
  it('unset / NaN / 0 refuse — never invent 5000', () => {
    expect(isPublishedConnectionCeiling(undefined)).toBe(false);
    expect(isPublishedConnectionCeiling(Number.NaN)).toBe(false);
    expect(isPublishedConnectionCeiling(0)).toBe(false);
  });

  it('owner-published 5000 is a ceiling', () => {
    expect(isPublishedConnectionCeiling(5000)).toBe(true);
  });

  it('owner-published 16 is a ceiling', () => {
    expect(isPublishedConnectionCeiling(16)).toBe(true);
  });
});

describe('attach unpublished WS_MAX_CONNECTIONS', () => {
  it('depth hub refuses ws.close.max_connections_unset', () => {
    const hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: undefined,
      marketsRefreshMs: 30_000,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.maxConnectionsUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('trade hub refuses ws.close.max_connections_unset', () => {
    const hub = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: undefined,
      recentLimit: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed?.reason).toBe(WS_COPY.maxConnectionsUnset);
    expect(hub.connections).toBe(0);
  });

  it('private hub refuses hub ceiling before per-user', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: undefined,
      maxConnectionsPerUser: 16,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed?.reason).toBe(WS_COPY.maxConnectionsUnset);
  });
});

describe('attach unpublished WS_PRIVATE_MAX_CONNECTIONS_PER_USER', () => {
  it('private hub refuses ws.close.private_max_connections_per_user_unset', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.privateMaxConnectionsPerUserUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('drop-copy hub refuses unpublished per-user cap', () => {
    const hub = new DropCopyHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      recentLimit: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).toBeNull();
    expect(sink.closed?.reason).toBe(WS_COPY.privateMaxConnectionsPerUserUnset);
  });

  it('owner-published 16 attaches', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      maxConnectionsPerUser: 16,
    });
    const sink = new FakeSink();
    expect(hub.attach('user-a', sink)).not.toBeNull();
    expect(sink.closed).toBeNull();
    expect(hub.connections).toBe(1);
  });
});
