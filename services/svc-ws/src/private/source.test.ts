import { describe, expect, it } from 'vitest';
import { MemoryEventBus, validatePayload } from '@intafaced/events';
import { PrivateOrderHub } from './hub.js';
import { subscribePrivateFills, subscribePrivateOrders, subscribePrivatePositions } from './source.js';

function sink() {
  const sent: string[] = [];
  return {
    sent,
    get bufferedBytes() {
      return 0;
    },
    send(frame: string) {
      sent.push(frame);
    },
    close() {
      /* unused */
    },
  };
}

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('private bus → hub sources', () => {
  it('fans positionUpdated only to the owning user on channel positions', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const alice = sink();
    const bob = sink();
    hub.attach(USER_A, alice);
    hub.attach(USER_B, bob);

    await subscribePrivatePositions({ bus, hub, durable: 'ws-test-positions' });

    const payload = validatePayload('positionUpdated', {
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: USER_A,
      marketId: 'btc-usdt-perp',
      symbol: 'BTC/USDT:USDT',
      status: 'open',
      side: 'long',
      contracts: '1.5',
      entryPrice: '64000',
      markPrice: '64100.5',
      notional: '96150.75',
      leverage: '5',
      collateral: '19230.15',
      unrealizedPnl: '150.75',
      realizedPnl: '0',
      liquidationPrice: '52000',
      marginMode: 'cross',
      fundingPaid: '-0.12',
      ts: '2026-07-31T00:00:00.000Z',
    });

    await bus.publish('positionUpdated', payload);

    expect(alice.sent).toHaveLength(1);
    const frame = JSON.parse(alice.sent[0]!);
    expect(frame.channel).toBe('positions');
    expect(frame.userId).toBe(USER_A);
    expect(frame.positionId).toBe(payload.positionId);
    expect(frame.contracts).toBe('1.5');
    expect(frame.entryPrice).toBe('64000');
    expect(typeof frame.contracts).toBe('string');
    expect(typeof frame.notional).toBe('string');
    expect(bob.sent).toHaveLength(0);
  });

  it('does not invent a position frame when nothing is published', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const alice = sink();
    hub.attach(USER_A, alice);
    await subscribePrivatePositions({ bus, hub, durable: 'ws-test-positions-silent' });
    expect(alice.sent).toHaveLength(0);
  });

  it('keeps order / fill / position channels isolated by owner', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const alice = sink();
    const bob = sink();
    hub.attach(USER_A, alice);
    hub.attach(USER_B, bob);

    await subscribePrivateOrders({ bus, hub, durable: 'ws-test-orders' });
    await subscribePrivateFills({ bus, hub, durable: 'ws-test-fills' });
    await subscribePrivatePositions({ bus, hub, durable: 'ws-test-positions-iso' });

    await bus.publish(
      'orderUpdated',
      validatePayload('orderUpdated', {
        orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        userId: USER_A,
        marketId: 'btc-usdt',
        status: 'open',
        side: 'buy',
        type: 'limit',
        qty: '1',
        filledQty: '0',
        price: '100',
        clientOrderId: null,
        ts: '2026-07-31T00:00:00.000Z',
      }),
    );
    await bus.publish(
      'fillSettled',
      validatePayload('fillSettled', {
        fillId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        userId: USER_B,
        marketId: 'btc-usdt',
        side: 'sell',
        liquidity: 'taker',
        price: '100',
        qty: '1',
        quoteAmount: '100',
        feeAsset: 'USDT',
        feeAmount: '0.1',
        feeBps: 10,
        sequence: 1,
        ts: '2026-07-31T00:00:00.000Z',
      }),
    );
    await bus.publish(
      'positionUpdated',
      validatePayload('positionUpdated', {
        positionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        userId: USER_A,
        marketId: 'btc-usdt-perp',
        symbol: 'BTC/USDT:USDT',
        status: 'closed',
        side: 'short',
        contracts: '0',
        entryPrice: '65000',
        markPrice: null,
        notional: '0',
        leverage: null,
        collateral: null,
        unrealizedPnl: null,
        realizedPnl: '12.5',
        liquidationPrice: null,
        marginMode: 'isolated',
        fundingPaid: '0.01',
        ts: '2026-07-31T00:00:01.000Z',
      }),
    );

    expect(alice.sent).toHaveLength(2);
    expect(JSON.parse(alice.sent[0]!).channel).toBe('orders');
    expect(JSON.parse(alice.sent[1]!).channel).toBe('positions');
    expect(bob.sent).toHaveLength(1);
    expect(JSON.parse(bob.sent[0]!).channel).toBe('fills');
  });
});
