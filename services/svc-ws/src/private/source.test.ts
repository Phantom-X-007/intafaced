import { describe, expect, it, vi } from 'vitest';
import { MemoryEventBus, validatePayload, type EventBus, type Subscription } from '@intafaced/events';
import { PrivateOrderHub } from './hub.js';
import { subscribePrivateFills, subscribePrivateOrders, subscribePrivatePositions, tryAttachPrivate } from './source.js';

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
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
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
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const alice = sink();
    hub.attach(USER_A, alice);
    await subscribePrivatePositions({ bus, hub, durable: 'ws-test-positions-silent' });
    expect(alice.sent).toHaveLength(0);
  });

  it('maps orderUpdated amounts as decimal strings on the orders channel', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const alice = sink();
    hub.attach(USER_A, alice);
    await subscribePrivateOrders({ bus, hub, durable: 'ws-test-orders-money' });

    await bus.publish(
      'orderUpdated',
      validatePayload('orderUpdated', {
        orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        userId: USER_A,
        marketId: 'btc-usdt',
        status: 'open',
        side: 'buy',
        type: 'limit',
        qty: '2.5',
        filledQty: '0.5',
        price: '64000.25',
        clientOrderId: 'cli-1',
        ts: '2026-07-31T00:00:00.000Z',
      }),
    );

    expect(alice.sent).toHaveLength(1);
    const frame = JSON.parse(alice.sent[0]!);
    expect(frame.channel).toBe('orders');
    expect(frame.fact).toBe('ack');
    expect(typeof frame.qty).toBe('string');
    expect(typeof frame.filledQty).toBe('string');
    expect(typeof frame.price).toBe('string');
    expect(frame.qty).toBe('2.5');
    expect(frame.price).toBe('64000.25');
  });

  it('maps fillSettled amounts as decimal strings on the fills channel', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const alice = sink();
    hub.attach(USER_A, alice);
    await subscribePrivateFills({ bus, hub, durable: 'ws-test-fills-money' });

    await bus.publish(
      'fillSettled',
      validatePayload('fillSettled', {
        fillId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        userId: USER_A,
        marketId: 'btc-usdt',
        side: 'buy',
        liquidity: 'maker',
        price: '100.5',
        qty: '0.01',
        quoteAmount: '1.005',
        feeAsset: 'USDT',
        feeAmount: '0.001005',
        feeBps: 10,
        sequence: 7,
        ts: '2026-07-31T00:00:00.000Z',
      }),
    );

    expect(alice.sent).toHaveLength(1);
    const frame = JSON.parse(alice.sent[0]!);
    expect(frame.channel).toBe('fills');
    expect(frame.fact).toBe('fill');
    expect(typeof frame.price).toBe('string');
    expect(typeof frame.qty).toBe('string');
    expect(typeof frame.quoteAmount).toBe('string');
    expect(typeof frame.feeAmount).toBe('string');
  });

  it('keeps order / fill / position channels isolated by owner', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
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

  it('tryAttachPrivate lands all three channels so a later order fans out', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const alice = sink();
    hub.attach(USER_A, alice);

    const attached = await tryAttachPrivate({ bus, hub, durable: 'ws-test-try-ok' });
    expect(attached).not.toBeNull();

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
    expect(alice.sent).toHaveLength(1);
    expect(JSON.parse(alice.sent[0]!).channel).toBe('orders');
    expect(JSON.parse(alice.sent[0]!).fact).toBe('ack');
  });

  it('fans reject and cancel as distinct facts from orderUpdated status', async () => {
    const bus = new MemoryEventBus('svc-ws-test');
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const alice = sink();
    hub.attach(USER_A, alice);
    await subscribePrivateOrders({ bus, hub, durable: 'ws-test-order-facts' });

    const base = {
      userId: USER_A,
      marketId: 'btc-usdt',
      side: 'buy' as const,
      type: 'limit' as const,
      qty: '1',
      filledQty: '0',
      price: '100',
      clientOrderId: null,
      ts: '2026-07-31T00:00:00.000Z',
    };
    await bus.publish(
      'orderUpdated',
      validatePayload('orderUpdated', {
        ...base,
        orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'rejected',
      }),
    );
    await bus.publish(
      'orderUpdated',
      validatePayload('orderUpdated', {
        ...base,
        orderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        status: 'cancelled',
      }),
    );

    expect(alice.sent.map((s) => JSON.parse(s).fact)).toEqual(['reject', 'cancel']);
    expect(JSON.parse(alice.sent[0]!).fact).not.toBe(JSON.parse(alice.sent[1]!).fact);
  });

  it('tryAttachPrivate tears a partial half and returns null when a later subscribe fails', async () => {
    let calls = 0;
    const unsub = vi.fn(async () => undefined);
    const bus = {
      subscribe: async () => {
        calls += 1;
        if (calls === 2) throw new Error('fills durable taken');
        return { unsubscribe: unsub } satisfies Subscription;
      },
    } as unknown as EventBus;
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const warn = vi.fn();

    const attached = await tryAttachPrivate({ bus, hub, durable: 'ws-test-try-partial', log: { info: vi.fn(), warn } });
    expect(attached).toBeNull();
    expect(calls).toBe(2);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});
