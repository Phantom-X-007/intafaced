/**
 * Attach / ingest refuse unpublished WS_TRADE_RECENT_LIMIT.
 * Never invent 50.
 */
import { describe, expect, it } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';
import { CLOSE_POLICY, type DepthSink } from './depth/hub.js';
import { TradeHub } from './trade/hub.js';
import { isPublishedTradeRecentLimit } from './trade-recent-limit.js';

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

describe('isPublishedTradeRecentLimit', () => {
  it('unset / NaN / 1001 refuse — never invent 50', () => {
    expect(isPublishedTradeRecentLimit(undefined)).toBe(false);
    expect(isPublishedTradeRecentLimit(Number.NaN)).toBe(false);
    expect(isPublishedTradeRecentLimit(1001)).toBe(false);
  });

  it('owner-published 50 is a replay window', () => {
    expect(isPublishedTradeRecentLimit(50)).toBe(true);
  });
});

describe('attach unpublished WS_TRADE_RECENT_LIMIT', () => {
  it('trade hub refuses ws.close.trade_recent_limit_unset before the seat ceiling', () => {
    const hub = new TradeHub({
      recentLimit: undefined,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.tradeRecentLimitUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('owner-published 50 attaches', () => {
    const hub = new TradeHub({
      recentLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    const sink = new FakeSink();
    expect(hub.attach('m-1', sink)).not.toBeNull();
    expect(sink.closed).toBeNull();
    expect(hub.connections).toBe(1);
  });
});

describe('ingest unpublished WS_TRADE_RECENT_LIMIT', () => {
  it('does not invent a 50-print ring even if a seat is forced open', () => {
    const hub = new TradeHub({
      recentLimit: undefined,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      ensureKnownMarket: async () => true,
    });
    expect(
      hub.ingest({
        marketId: 'm-1',
        price: '100',
        qty: '1',
        sequence: 1,
        ts: '2026-09-05T00:00:00.000Z',
      }),
    ).toBeNull();
    expect(hub.recentFor('m-1')).toHaveLength(0);
  });
});
