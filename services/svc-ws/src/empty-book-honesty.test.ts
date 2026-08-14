import { describe, expect, it } from 'vitest';
import type { DepthMessage, DepthSnapshot } from '@intafaced/market-data';
import { CLOSE_POLICY, DepthHub, snapshotHasRestingDepth, type DepthSink } from './depth/hub.js';
import type { DepthSource } from './depth/source.js';
import { TradeHub, type TradeSink } from './trade/hub.js';

/**
 * Empty ≠ zero. A public hub must not emit bids/asks `[]` that a client can
 * read as a priced empty book when matching holds no book. Unknown markets
 * stay a typed close. No invented mids.
 */

const MARKET = 'BTC-USDT';
const LISTED = 'fbbe6534-e7af-49a8-a782-bbdd1e1894ba';

function liveSnapshot(sequence: number, marketId = MARKET): DepthSnapshot {
  return { type: 'snapshot', marketId, sequence, bids: [['100', '1']], asks: [['101', '1']] };
}

function emptySnapshot(marketId = MARKET): DepthSnapshot {
  return { type: 'snapshot', marketId, sequence: 0, bids: [], asks: [] };
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

  messages(): DepthMessage[] {
    return this.frames.map((f) => JSON.parse(f) as DepthMessage);
  }
}

class FakeSource implements DepthSource {
  constructor(
    readonly marketList: string[],
    readonly current = new Map<string, DepthSnapshot>(),
    public failSnapshot: Error | null = null,
  ) {}

  async markets(): Promise<readonly string[]> {
    return this.marketList;
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    if (this.failSnapshot) throw this.failSnapshot;
    const s = this.current.get(marketId);
    if (!s) throw new Error(`no upstream book for ${marketId}`);
    return s;
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function depthHub(source: FakeSource, registryMarkets?: string[]) {
  return new DepthHub(source, {
    depthLimit: 50,
    highWaterBytes: 1_000,
    maxLagTicks: 3,
    maxConnections: 100,
    marketsRefreshMs: 0,
    ...(registryMarkets ? { registry: { markets: async () => registryMarkets } } : {}),
  });
}

/** Done-bar: a client must not be able to read [] as a live zero book. */
function expectNoPricedEmptyBook(frames: readonly string[]): void {
  for (const frame of frames) {
    const msg = JSON.parse(frame) as DepthMessage;
    if (msg.type !== 'snapshot') continue;
    expect(snapshotHasRestingDepth(msg), `priced empty book on the wire: ${frame}`).toBe(true);
  }
}

describe('empty book is absent, not a zero book', () => {
  it('does not emit bids/asks [] when matching has never allocated a book', async () => {
    const source = new FakeSource([], new Map([[LISTED, emptySnapshot(LISTED)]]));
    const hub = depthHub(source, [LISTED]);
    const sink = new FakeSink();
    hub.attach(LISTED, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expectNoPricedEmptyBook(sink.frames);
    expect(hub.bookFor(LISTED)).toBeUndefined();
  });

  it('does not emit bids/asks [] when matching is down', async () => {
    const source = new FakeSource([MARKET], new Map(), new Error('svc-matching unreachable'));
    const hub = depthHub(source);
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expectNoPricedEmptyBook(sink.frames);
  });

  it('closes an unknown market — typed close, no fabricated depth', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(10)]]));
    const hub = depthHub(source);
    const sink = new FakeSink();
    hub.attach('NOT-A-MARKET', sink);
    await settle();

    expect(sink.closed).toEqual({ code: CLOSE_POLICY, reason: 'unknown market "NOT-A-MARKET"' });
    expect(sink.frames).toEqual([]);
    expectNoPricedEmptyBook(sink.frames);
  });

  it('publishes the first real book as a snapshot, never a delta off empty@0', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, emptySnapshot()]]));
    const hub = depthHub(source);
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    hub.ingest(liveSnapshot(7));

    expect(sink.messages()[0]).toMatchObject({ type: 'snapshot', sequence: 7, marketId: MARKET });
    expectNoPricedEmptyBook(sink.frames);
  });

  it('trade tape with no prints sends no empty book-shaped frame', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(1)]]));
    const depth = depthHub(source);
    await depth.refreshMarkets();
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
    });
    const sink = new FakeSink();
    trades.attach(MARKET, sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expect(sink.frames.some((f) => f.includes('"bids"') || f.includes('"asks"'))).toBe(false);
  });

  it('trade tape closes unknown markets without a fake empty tape object', async () => {
    const source = new FakeSource([MARKET]);
    const depth = depthHub(source);
    const trades = new TradeHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      recentLimit: 10,
      ensureKnownMarket: (id) => depth.ensureKnownMarket(id),
    });
    const sink = new FakeSink();
    trades.attach('NOPE', sink);
    await settle();

    expect(sink.closed?.code).toBe(CLOSE_POLICY);
    expect(sink.closed?.reason).toMatch(/unknown market/);
    expect(sink.frames).toEqual([]);
  });
});
