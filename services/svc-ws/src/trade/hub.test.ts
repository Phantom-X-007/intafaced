import { beforeEach, describe, expect, it } from 'vitest';
import type { TradePrint } from '@intafaced/market-data';
import { CLOSE_POLICY, CLOSE_TRY_LATER } from '../depth/hub.js';
import { TradeHub, type TradeSink } from './hub.js';

const MARKET = 'BTC-USDT';
const OTHER = 'ETH-USDT';

function fill(sequence: number, marketId = MARKET, price = '100', qty = '1') {
  return {
    marketId,
    makerOrderId: '11111111-1111-1111-1111-111111111111',
    takerOrderId: '22222222-2222-2222-2222-222222222222',
    price,
    qty,
    sequence,
    ts: `2026-07-29T12:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
  };
}

class FakeSink implements TradeSink {
  readonly frames: string[] = [];
  closed: { code: number; reason: string } | null = null;
  bufferedBytes = 0;
  broken = false;

  send(frame: string): void {
    if (this.broken) throw new Error('EPIPE');
    this.frames.push(frame);
  }

  close(code: number, reason: string): void {
    this.closed ??= { code, reason };
  }

  prints(): TradePrint[] {
    return this.frames.map((f) => JSON.parse(f) as TradePrint);
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function hubFor(known: readonly string[] = [MARKET, OTHER], overrides: Partial<ConstructorParameters<typeof TradeHub>[0]> = {}): TradeHub {
  return new TradeHub({
    highWaterBytes: 1_000,
    maxLagTicks: 3,
    maxConnections: 100,
    recentLimit: 5,
    ensureKnownMarket: async (id) => known.includes(id),
    ...overrides,
  });
}

describe('TradeHub fan-out', () => {
  let hub: TradeHub;

  beforeEach(() => {
    hub = hubFor();
  });

  it('replays recent prints on connect, then streams live ones', async () => {
    hub.ingest(fill(1, MARKET, '100', '1'));
    hub.ingest(fill(2, MARKET, '101', '2'));

    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    expect(sink.prints()).toEqual([
      expect.objectContaining({ type: 'trade', sequence: 1, price: '100', quantity: '1' }),
      expect.objectContaining({ type: 'trade', sequence: 2, price: '101', quantity: '2' }),
    ]);

    hub.ingest(fill(3, MARKET, '102', '3'));
    expect(sink.prints()).toHaveLength(3);
    expect(sink.prints()[2]).toMatchObject({ sequence: 3, price: '102', quantity: '3' });
  });

  it('never puts order ids on the wire', async () => {
    hub.ingest(fill(1));
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    const wire = sink.frames.join('\n');
    expect(wire).not.toContain('makerOrderId');
    expect(wire).not.toContain('takerOrderId');
    expect(wire).not.toContain('11111111-1111-1111-1111-111111111111');
  });

  it('fans one print out to every subscriber on that market only', async () => {
    const a = new FakeSink();
    const b = new FakeSink();
    const other = new FakeSink();
    hub.attach(MARKET, a);
    hub.attach(MARKET, b);
    hub.attach(OTHER, other);
    await settle();

    hub.ingest(fill(10, MARKET, '200', '0.5'));

    expect(a.prints()).toHaveLength(1);
    expect(b.prints()).toHaveLength(1);
    expect(other.prints()).toHaveLength(0);
    expect(a.prints()[0]?.marketId).toBe(MARKET);
  });

  it('dedupes redelivered fills by sequence', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    expect(hub.ingest(fill(1))).not.toBeNull();
    expect(hub.ingest(fill(1))).toBeNull();
    expect(sink.prints()).toHaveLength(1);
  });

  it('bounds the recent ring and drops order-id-bearing history with it', async () => {
    for (let i = 1; i <= 8; i += 1) hub.ingest(fill(i));

    const recent = hub.recentFor(MARKET);
    expect(recent).toHaveLength(5);
    expect(recent[0]?.sequence).toBe(4);
    expect(recent[4]?.sequence).toBe(8);
  });

  it('closes unknown markets without ever accepting them as subscribers', async () => {
    const sink = new FakeSink();
    hub.attach('NOPE', sink);
    await settle();

    expect(sink.closed?.code).toBe(CLOSE_POLICY);
    expect(sink.closed?.reason).toMatch(/unknown market/);
    expect(hub.connections).toBe(0);
  });

  it('drops prints for a slow consumer and eventually disconnects', async () => {
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    sink.bufferedBytes = 10_000;
    hub.ingest(fill(1));
    hub.ingest(fill(2));
    hub.ingest(fill(3));

    expect(sink.prints()).toHaveLength(0);
    expect(sink.closed?.code).toBe(CLOSE_TRY_LATER);
    expect(hub.stats.droppedFrames).toBe(3);
    expect(hub.stats.evictions).toBe(1);
  });

  it('does not double-send prints that arrived during the connect flush', async () => {
    // A fill lands while ensureKnownMarket is in flight: it must appear once
    // via the recent replay, not again as a live fan-out.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    hub = hubFor([MARKET], {
      ensureKnownMarket: async () => {
        await gate;
        return true;
      },
    });

    hub.ingest(fill(1));
    const sink = new FakeSink();
    hub.attach(MARKET, sink);

    hub.ingest(fill(2));
    release();
    await settle();
    await settle();

    expect(sink.prints().map((p) => p.sequence)).toEqual([1, 2]);
  });

  it('amounts on the wire are decimal strings, never JSON numbers', async () => {
    hub.ingest(fill(1, MARKET, '30000.5', '1.25'));
    const sink = new FakeSink();
    hub.attach(MARKET, sink);
    await settle();

    const raw = sink.frames[0]!;
    // JSON numbers for price/qty would appear without quotes.
    expect(raw).toMatch(/"price":"30000\.5"/);
    expect(raw).toMatch(/"quantity":"1\.25"/);
    expect(raw).not.toMatch(/"price":30000/);
  });

  it('closeAll tells every client why', async () => {
    const a = new FakeSink();
    const b = new FakeSink();
    hub.attach(MARKET, a);
    hub.attach(OTHER, b);
    await settle();

    hub.closeAll(1001, 'gateway shutting down');

    expect(a.closed).toEqual({ code: 1001, reason: 'gateway shutting down' });
    expect(b.closed).toEqual({ code: 1001, reason: 'gateway shutting down' });
    expect(hub.connections).toBe(0);
  });
});
