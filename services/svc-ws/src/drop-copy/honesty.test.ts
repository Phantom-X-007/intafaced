import { describe, expect, it } from 'vitest';
import { ORDERS_ENGINE_UNAVAILABLE, PrivateOrderHub } from '../private/hub.js';
import {
  DROP_COPY_CHANNEL,
  DROP_COPY_COMMON_UPSTREAM_FAILURE,
  DropCopyHub,
  isInventedCompleteEmptyDropCopy,
  type DropCopyExecutionInput,
} from './hub.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function fill(): DropCopyExecutionInput {
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
  };
}

class FakeSink {
  readonly frames: string[] = [];
  closed: { code: number; reason: string } | null = null;
  bufferedBytes = 0;
  send(frame: string): void {
    this.frames.push(frame);
  }
  close(code: number, reason: string): void {
    this.closed ??= { code, reason };
  }
  parsed(): Array<Record<string, unknown>> {
    return this.frames.map((f) => JSON.parse(f) as Record<string, unknown>);
  }
}

describe('drop-copy honesty vs trading session', () => {
  it('trading-session engine-unavailable does not look like a complete empty drop-copy', () => {
    const trading = new PrivateOrderHub({ highWaterBytes: 1_000, maxLagTicks: 3, maxConnections: 8, maxConnectionsPerUser: 8 });
    const drop = new DropCopyHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 8,
      maxConnectionsPerUser: 8,
      recentLimit: 10,
    });
    drop.announceBus(true);

    const tradeSink = new FakeSink();
    const dropSink = new FakeSink();
    trading.attach(USER, tradeSink);
    drop.attach(USER, dropSink);
    trading.markEngineUnavailable();

    expect(tradeSink.parsed().some((f) => f.code === ORDERS_ENGINE_UNAVAILABLE)).toBe(true);
    expect(dropSink.parsed().some((f) => f.channel === 'fills')).toBe(false);
    expect(dropSink.parsed().every((f) => f.channel === DROP_COPY_CHANNEL || f.channel == null)).toBe(true);
    expect(dropSink.parsed().some((f) => f.completeness === 'complete')).toBe(false);
    for (const frame of dropSink.frames) {
      expect(isInventedCompleteEmptyDropCopy(frame)).toBe(false);
    }

    drop.publishExecution(fill());
    expect(dropSink.parsed().some((f) => f.type === 'execution' && f.dropCopySeq === 1)).toBe(true);
    expect(tradeSink.parsed().some((f) => f.type === 'execution')).toBe(false);
  });

  it('common-upstream failure is named; empty is not complete', () => {
    const drop = new DropCopyHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 8,
      maxConnectionsPerUser: 8,
      recentLimit: 10,
    });
    const sink = new FakeSink();
    drop.attach(USER, sink);
    expect(drop.busAttached).toBe(false);
    expect(sink.parsed().some((f) => f.code === DROP_COPY_COMMON_UPSTREAM_FAILURE)).toBe(true);
    expect(sink.parsed().some((f) => f.type === 'execution')).toBe(false);
    expect(sink.parsed().some((f) => f.completeness === 'complete')).toBe(false);
  });
});
