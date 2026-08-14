import { describe, expect, it } from 'vitest';
import type { DepthSnapshot, TradePrint } from '@intafaced/market-data';
import { CLOSE_POLICY, DepthHub, type DepthSink } from './depth/hub.js';
import type { DepthSource } from './depth/source.js';
import { isLiveZeroTapeFrame, TradeHub, type TradeSink } from './trade/hub.js';

/**
 * Empty ≠ zero. A public trades hub must not emit `{ trades: [] }` (or JSON
 * `[]`) that a client can read as a live zero tape. Unknown markets stay a
 * typed close. No invented prints or mids.
 */

const MARKET = 'BTC-USDT';

function liveSnapshot(sequence: number, marketId = MARKET): DepthSnapshot {
  return { type: 'snapshot', marketId, sequence, bids: [['100', '1']], asks: [['101', '1']] };
}

function print(sequence: number, marketId = MARKET): TradePrint {
  return {
    type: 'trade',
    marketId,
    sequence,
    price: '100',
    quantity: '1',
    ts: `2026-07-29T12:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
  };
}

class FakeSink implements DepthSink, TradeSink {
  readonly frames: string[] = [];
  closed: { code: number; reason: string } | null = null;
  bufferedBytes = 0;

  send(frame: string): void {
    this.frames.push(frame);
  }

  close(code: number, reason: string): void {
    this.closed ??= { code, reason };
  }
}

class FakeSource implements DepthSource {
  constructor(
    readonly marketList: string[],
    readonly current = new Map<string, DepthSnapshot>(),
  ) {}

  async markets(): Promise<readonly string[]> {
    return this.marketList;
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    const s = this.current.get(marketId);
    if (!s) throw new Error(`no upstream book for ${marketId}`);
    return s;
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function depthHub(source: FakeSource) {
  return new DepthHub(source, {
    depthLimit: 50,
    highWaterBytes: 1_000,
    maxLagTicks: 3,
    maxConnections: 100,
    marketsRefreshMs: 0,
  });
}

/** Done-bar: a client must not be able to read [] as a live zero tape. */
function expectNoLiveZeroTape(frames: readonly string[]): void {
  for (const frame of frames) {
    expect(isLiveZeroTapeFrame(frame), `live zero tape on the wire: ${frame}`).toBe(false);
  }
}

describe('isLiveZeroTapeFrame', () => {
  it('treats [] and { trades: [] } as a live zero tape', () => {
    expect(isLiveZeroTapeFrame('[]')).toBe(true);
    expect(isLiveZeroTapeFrame('{"trades":[]}')).toBe(true);
    expect(isLiveZeroTapeFrame('{"type":"trades","trades":[]}')).toBe(true);
  });

  it('does not flag a real TradePrint', () => {
    expect(isLiveZeroTapeFrame(JSON.stringify(print(1)))).toBe(false);
    expect(isLiveZeroTapeFrame(JSON.stringify({ marketId: MARKET, trades: [print(1)] }))).toBe(false);
  });
});

describe('empty trades tape is absent, not a zero print', () => {
  it('does not emit { trades: [] } when a listed market has never printed', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(1)]]));
    const depth = depthHub(source);
    await depth.refreshMarkets();
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
      seedRecent: async () => [],
    });
    const sink = new FakeSink();
    trades.attach(MARKET, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expectNoLiveZeroTape(sink.frames);
    expect(trades.recentFor(MARKET)).toEqual([]);
    expect(trades.stats.markets).toBe(0);
  });

  it('does not emit { trades: [] } when matching 404s / seed throws', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(1)]]));
    const depth = depthHub(source);
    await depth.refreshMarkets();
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
      seedRecent: async () => {
        throw new Error('svc-matching 404: no tape');
      },
    });
    const sink = new FakeSink();
    trades.attach(MARKET, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expectNoLiveZeroTape(sink.frames);
    expect(trades.stats.markets).toBe(0);
  });

  it('closes an unknown market — typed close, no fabricated empty tape', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(10)]]));
    const depth = depthHub(source);
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
      seedRecent: async () => [],
    });
    const sink = new FakeSink();
    trades.attach('NOPE', sink);
    await settle();

    expect(sink.closed).toEqual({ code: CLOSE_POLICY, reason: 'unknown market "NOPE"' });
    expect(sink.frames).toEqual([]);
    expectNoLiveZeroTape(sink.frames);
  });

  it('publishes the first real print as a TradePrint, never an empty tape object', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(1)]]));
    const depth = depthHub(source);
    await depth.refreshMarkets();
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
      seedRecent: async () => [],
    });
    const sink = new FakeSink();
    trades.attach(MARKET, sink);
    await settle();

    trades.ingest({
      marketId: MARKET,
      price: '30100.5',
      qty: '0.1',
      sequence: 7,
      ts: '2026-07-29T12:00:07.000Z',
    });

    expect(JSON.parse(sink.frames[0]!)).toMatchObject({
      type: 'trade',
      sequence: 7,
      marketId: MARKET,
      price: '30100.5',
      quantity: '0.1',
    });
    expectNoLiveZeroTape(sink.frames);
    expect(sink.frames[0]).not.toMatch(/"side"/);
  });

  it('replays a non-empty seed as prints, never wrapping [] as a live tape', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(1)]]));
    const depth = depthHub(source);
    await depth.refreshMarkets();
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
      seedRecent: async () => [print(3)],
    });
    const sink = new FakeSink();
    trades.attach(MARKET, sink);
    await settle();

    expect(JSON.parse(sink.frames[0]!)).toMatchObject({ type: 'trade', sequence: 3 });
    expectNoLiveZeroTape(sink.frames);
  });
});
