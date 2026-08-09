import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { TRADE_PRINT_PUBLIC_KEYS, type TradePrint } from '@intafaced/market-data';
import { TradeHub } from './hub.js';
import { subscribeTradeTape } from './source.js';

const MARKET = 'BTC-USDT';
const SETTLE = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const MAKER_ORDER_ID = '11111111-1111-1111-1111-111111111111';
const TAKER_ORDER_ID = '22222222-2222-2222-2222-222222222222';

describe('subscribeTradeTape', () => {
  it('turns orderFilled into a public TradePrint — order ids stripped, no invented side', async () => {
    const bus = new MemoryEventBus('matching-test');
    const frames: string[] = [];
    const hub = new TradeHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 10,
      recentLimit: 10,
      ensureKnownMarket: async (id) => id === MARKET,
    });

    await subscribeTradeTape({ bus, hub, durable: 'ws-trade-tape-test' });

    hub.attach(MARKET, {
      bufferedBytes: 0,
      send: (frame) => frames.push(frame),
      close: () => undefined,
    });
    await SETTLE();

    // Catalog payload only — bus refuses undeclared keys (account ids / side /
    // house are not on orderFilled; hub.ingest residual pins cover those).
    await bus.publish(
      'orderFilled',
      {
        marketId: MARKET,
        makerOrderId: MAKER_ORDER_ID,
        takerOrderId: TAKER_ORDER_ID,
        price: '99.5',
        qty: '2',
        sequence: 7,
        ts: '2026-07-29T15:00:00.000Z',
      },
      { idempotencyKey: 'matching.order.filled:BTC-USDT:7' },
    );

    expect(frames).toHaveLength(1);
    const wire = frames[0]!;
    const print = JSON.parse(wire) as TradePrint;
    expect(Object.keys(print).sort()).toEqual([...TRADE_PRINT_PUBLIC_KEYS].sort());
    expect(print).toEqual({
      type: 'trade',
      marketId: MARKET,
      sequence: 7,
      price: '99.5',
      quantity: '2',
      ts: '2026-07-29T15:00:00.000Z',
    });
    // Aggressor side is not on the event — never invent it on the public frame.
    expect(print).not.toHaveProperty('side');
    expect(wire).not.toMatch(/"side"/);
    expect(wire).not.toContain(MAKER_ORDER_ID);
    expect(wire).not.toContain(TAKER_ORDER_ID);
    expect(wire).not.toContain('makerOrderId');
    expect(wire).not.toContain('takerOrderId');
  });
});
