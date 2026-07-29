import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import type { TradePrint } from '@intafaced/market-data';
import { TradeHub } from './hub.js';
import { subscribeTradeTape } from './source.js';

const MARKET = 'BTC-USDT';
const SETTLE = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('subscribeTradeTape', () => {
  it('turns orderFilled into a public TradePrint on the hub', async () => {
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

    await bus.publish(
      'orderFilled',
      {
        marketId: MARKET,
        makerOrderId: '11111111-1111-1111-1111-111111111111',
        takerOrderId: '22222222-2222-2222-2222-222222222222',
        price: '99.5',
        qty: '2',
        sequence: 7,
        ts: '2026-07-29T15:00:00.000Z',
      },
      { idempotencyKey: 'matching.order.filled:BTC-USDT:7' },
    );

    expect(frames).toHaveLength(1);
    const print = JSON.parse(frames[0]!) as TradePrint;
    expect(print).toEqual({
      type: 'trade',
      marketId: MARKET,
      sequence: 7,
      price: '99.5',
      quantity: '2',
      ts: '2026-07-29T15:00:00.000Z',
    });
    expect(frames[0]).not.toContain('makerOrderId');
  });
});
