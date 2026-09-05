/**
 * Attach / ingest refuse unpublished WS_DROP_COPY_RECENT_LIMIT.
 * Never invent 50.
 */
import { describe, expect, it } from 'vitest';
import { resolveWsCopy, WS_COPY } from './copy.js';
import { CLOSE_POLICY, type DepthSink } from './depth/hub.js';
import { DropCopyHub, type DropCopyExecutionInput } from './drop-copy/hub.js';
import { isPublishedDropCopyRecentLimit } from './drop-copy-recent-limit.js';

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

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function fill(partial: Partial<DropCopyExecutionInput> = {}): DropCopyExecutionInput {
  return {
    fillId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    userId: USER,
    marketId: 'btc-usdt',
    side: 'buy',
    liquidity: 'maker',
    price: '100.5',
    qty: '0.01',
    quoteAmount: '1.005',
    feeAsset: 'USDT',
    feeAmount: '0.001005',
    engineSequence: 7,
    ts: '2026-07-31T00:00:00.000Z',
    ...partial,
  };
}

describe('isPublishedDropCopyRecentLimit', () => {
  it('unset / NaN / 1001 refuse — never invent 50', () => {
    expect(isPublishedDropCopyRecentLimit(undefined)).toBe(false);
    expect(isPublishedDropCopyRecentLimit(Number.NaN)).toBe(false);
    expect(isPublishedDropCopyRecentLimit(1001)).toBe(false);
  });

  it('owner-published 50 is a replay window', () => {
    expect(isPublishedDropCopyRecentLimit(50)).toBe(true);
  });
});

describe('attach unpublished WS_DROP_COPY_RECENT_LIMIT', () => {
  it('drop-copy hub refuses ws.close.drop_copy_recent_limit_unset before the seat ceiling', () => {
    const hub = new DropCopyHub({
      recentLimit: undefined,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach(USER, sink)).toBeNull();
    expect(sink.closed).toEqual({
      code: CLOSE_POLICY,
      reason: resolveWsCopy(WS_COPY.dropCopyRecentLimitUnset),
    });
    expect(hub.connections).toBe(0);
  });

  it('owner-published 50 attaches', () => {
    const hub = new DropCopyHub({
      recentLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    const sink = new FakeSink();
    expect(hub.attach(USER, sink)).not.toBeNull();
    expect(sink.closed).toBeNull();
    expect(hub.connections).toBe(1);
  });
});

describe('ingest unpublished WS_DROP_COPY_RECENT_LIMIT', () => {
  it('does not invent a 50-print ring even if a seat is forced open', () => {
    const hub = new DropCopyHub({
      recentLimit: undefined,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
    });
    expect(hub.publishExecution(fill())).toBeNull();
    expect(hub.recentFor(USER)).toHaveLength(0);
  });
});
