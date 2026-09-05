import { describe, expect, it } from 'vitest';
import type { DepthSnapshot } from '@intafaced/market-data';
import { DEPTH_L3_UNAVAILABLE } from '../gateway-policy.js';
import { NativeL3Hub } from './l3-hub.js';
import { DepthL3UnavailableError, type DepthSource, type NativeL3Queue } from './source.js';
import type { DepthSink } from './hub.js';

const MARKET = 'BTC-USDT';

const native: NativeL3Queue = {
  level: 'L3',
  marketId: MARKET,
  bids: [],
  asks: [{ price: '100', orders: [{ orderId: 'o1', remaining: '1', sequence: 3 }] }],
};

class RecordingSink implements DepthSink {
  readonly frames: string[] = [];
  bufferedBytes = 0;
  closed: { code: number; reason: string } | null = null;
  send(frame: string): void {
    this.frames.push(frame);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}

class Source implements DepthSource {
  snapshotCalls = 0;
  queue: NativeL3Queue | DepthL3UnavailableError = native;

  async markets(): Promise<readonly string[]> {
    return [MARKET];
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    this.snapshotCalls += 1;
    return { type: 'snapshot', marketId, sequence: 1, bids: [['100', '9']], asks: [] };
  }

  async l3Queue(marketId: string): Promise<NativeL3Queue> {
    if (this.queue instanceof DepthL3UnavailableError) throw this.queue;
    return { ...this.queue, marketId };
  }
}

describe('NativeL3Hub', () => {
  it('probes matching native L3 and never calls L2 snapshot', async () => {
    const source = new Source();
    const hub = new NativeL3Hub(source, {
      highWaterBytes: 1_000,
      maxLagTicks: 2,
      maxConnections: 4,
      ensureKnownMarket: async () => true,
    });

    expect(await hub.probe(MARKET)).toBe('ok');
    expect(source.snapshotCalls).toBe(0);

    const sink = new RecordingSink();
    hub.attach(MARKET, sink);
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(sink.frames[0]!)).toMatchObject({
      type: 'snapshot',
      transport: 'poll',
      level: 'L3',
      asks: native.asks,
    });
    expect(JSON.parse(sink.frames[0]!).asks).not.toEqual([['100', '9']]);
  });

  it('probe names unavailable when matching hitch is missing — does not copy L2', async () => {
    const source = new Source();
    source.queue = new DepthL3UnavailableError(MARKET);
    const hub = new NativeL3Hub(source, {
      highWaterBytes: 1_000,
      maxLagTicks: 2,
      maxConnections: 4,
      ensureKnownMarket: async () => true,
    });

    expect(await hub.probe(MARKET)).toBe('unavailable');
    expect(source.snapshotCalls).toBe(0);
  });

  it('poll tick uses l3Queue only', async () => {
    const source = new Source();
    const hub = new NativeL3Hub(source, {
      highWaterBytes: 1_000,
      maxLagTicks: 2,
      maxConnections: 4,
      ensureKnownMarket: async () => true,
    });
    const sink = new RecordingSink();
    hub.attach(MARKET, sink);
    await new Promise((r) => setTimeout(r, 0));
    source.snapshotCalls = 0;
    source.queue = {
      level: 'L3',
      marketId: MARKET,
      bids: [{ price: '99', orders: [{ orderId: 'o2', remaining: '2', sequence: 8 }] }],
      asks: [],
    };
    await hub.tick();
    expect(source.snapshotCalls).toBe(0);
    expect(JSON.parse(sink.frames.at(-1)!)).toMatchObject({ level: 'L3', bids: source.queue.bids });
  });

  it('fan-out names depth.l3_unavailable without an L2 ladder', () => {
    const source = new Source();
    const hub = new NativeL3Hub(source, {
      highWaterBytes: 1_000,
      maxLagTicks: 2,
      maxConnections: 4,
      ensureKnownMarket: async () => true,
    });
    const sink = new RecordingSink();
    hub.attach(MARKET, sink);
    hub.markL3Unavailable(MARKET);
    expect(JSON.parse(sink.frames.at(-1)!)).toEqual({ type: 'status', code: DEPTH_L3_UNAVAILABLE, marketId: MARKET });
    expect(sink.frames.at(-1)!).not.toContain('"bids":[["100"');
  });
});
