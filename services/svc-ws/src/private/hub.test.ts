import { describe, expect, it } from 'vitest';
import { PrivateOrderHub, type PrivateOrderUpdate, type PrivatePositionUpdate } from './hub.js';

function sink() {
  const sent: string[] = [];
  let closed: { code: number; reason: string } | null = null;
  return {
    sent,
    get bufferedBytes() {
      return 0;
    },
    send(frame: string) {
      sent.push(frame);
    },
    close(code: number, reason: string) {
      closed = { code, reason };
    },
    get closed() {
      return closed;
    },
  };
}

const update = (userId: string, orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'): PrivateOrderUpdate => ({
  orderId,
  userId,
  marketId: 'btc-usdt',
  status: 'open',
  side: 'buy',
  type: 'limit',
  qty: '1',
  filledQty: '0',
  price: '100',
  clientOrderId: null,
  ts: '2026-07-30T00:00:00.000Z',
});

describe('PrivateOrderHub', () => {
  it('fans an update only to the owning user', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const alice = sink();
    const bob = sink();
    hub.attach('user-a', alice);
    hub.attach('user-b', bob);

    hub.publish(update('user-a'));

    expect(alice.sent).toHaveLength(1);
    expect(JSON.parse(alice.sent[0]!).userId).toBe('user-a');
    expect(bob.sent).toHaveLength(0);
  });

  it('fans fills only to the owning user on channel fills', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const alice = sink();
    const bob = sink();
    hub.attach('user-a', alice);
    hub.attach('user-b', bob);
    hub.publishFill({
      fillId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 'user-a',
      marketId: 'btc-usdt',
      side: 'buy',
      liquidity: 'taker',
      price: '100',
      qty: '1',
      quoteAmount: '100',
      feeAsset: 'USDT',
      feeAmount: '0.1',
      feeBps: 10,
      sequence: 1,
      ts: '2026-07-30T00:00:00.000Z',
    });
    expect(alice.sent).toHaveLength(1);
    expect(JSON.parse(alice.sent[0]!).channel).toBe('fills');
    expect(bob.sent).toHaveLength(0);
  });

  it('refuses attach when at capacity (null detach — no subscription)', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 1 });
    const first = sink();
    const second = sink();
    const d1 = hub.attach('user-a', first);
    const d2 = hub.attach('user-b', second);
    expect(d1).not.toBeNull();
    expect(d2).toBeNull();
    expect(second.closed?.code).toBe(1013);
    expect(hub.connections).toBe(1);
  });

  it('refuses a user past per-user cap while another user still attaches', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 100,
      maxConnectionsPerUser: 2,
    });
    const a1 = sink();
    const a2 = sink();
    const a3 = sink();
    const b1 = sink();
    expect(hub.attach('user-a', a1)).not.toBeNull();
    expect(hub.attach('user-a', a2)).not.toBeNull();
    expect(hub.attach('user-a', a3)).toBeNull();
    expect(a3.closed?.code).toBe(1013);
    expect(a3.closed?.reason).toMatch(/too many private connections/i);
    expect(hub.connections).toBe(2);

    expect(hub.attach('user-b', b1)).not.toBeNull();
    expect(hub.connections).toBe(3);
  });

  it('reconnect after detach gets no replay of past orders (push-only)', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const first = sink();
    const detach = hub.attach('user-a', first);
    hub.publish(update('user-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    expect(first.sent).toHaveLength(1);
    detach!();

    const second = sink();
    hub.attach('user-a', second);
    expect(second.sent).toHaveLength(0);

    hub.publish(update('user-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
    expect(second.sent).toHaveLength(1);
    expect(JSON.parse(second.sent[0]!).orderId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('evicts a lagging order subscriber without inventing fills', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 10, maxLagTicks: 2, maxConnections: 10 });
    const lagging = {
      sent: [] as string[],
      get bufferedBytes() {
        return 100;
      },
      send() {
        throw new Error('should not send while lagging');
      },
      closed: null as { code: number; reason: string } | null,
      close(code: number, reason: string) {
        this.closed = { code, reason };
      },
    };
    hub.attach('user-a', lagging);
    hub.publish(update('user-a'));
    hub.publish(update('user-a'));
    expect(lagging.closed?.code).toBe(1013);
    expect(lagging.closed?.reason).toMatch(/slow consumer/i);
    expect(lagging.sent).toHaveLength(0);
  });

  it('fans positions only to the owning user on channel positions', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    const alice = sink();
    const bob = sink();
    hub.attach('user-a', alice);
    hub.attach('user-b', bob);

    const position: PrivatePositionUpdate = {
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: 'user-a',
      marketId: 'btc-usdt-perp',
      symbol: 'BTC/USDT:USDT',
      status: 'open',
      side: 'long',
      contracts: '2',
      entryPrice: '60000',
      markPrice: '60100',
      notional: '120200',
      leverage: '10',
      collateral: '12020',
      unrealizedPnl: '200',
      realizedPnl: '0',
      liquidationPrice: '54000',
      marginMode: 'cross',
      fundingPaid: '0',
      ts: '2026-07-31T00:00:00.000Z',
    };
    hub.publishPosition(position);

    expect(alice.sent).toHaveLength(1);
    const frame = JSON.parse(alice.sent[0]!);
    expect(frame.channel).toBe('positions');
    expect(frame.side).toBe('long');
    expect(frame.contracts).toBe('2');
    expect(bob.sent).toHaveLength(0);
  });

  it('evicts a lagging positions subscriber without touching a healthy peer', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 10, maxLagTicks: 2, maxConnections: 10 });
    const lagging = {
      sent: [] as string[],
      get bufferedBytes() {
        return 100;
      },
      send() {
        throw new Error('should not send while lagging');
      },
      closed: null as { code: number; reason: string } | null,
      close(code: number, reason: string) {
        this.closed = { code, reason };
      },
    };
    const healthy = sink();
    hub.attach('user-a', lagging);
    hub.attach('user-a', healthy);

    const position: PrivatePositionUpdate = {
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: 'user-a',
      marketId: 'btc-usdt-perp',
      symbol: 'BTC/USDT:USDT',
      status: 'open',
      side: 'short',
      contracts: '1',
      entryPrice: '1',
      markPrice: '1',
      notional: '1',
      leverage: '1',
      collateral: '1',
      unrealizedPnl: '0',
      realizedPnl: '0',
      liquidationPrice: null,
      marginMode: 'isolated',
      fundingPaid: '0',
      ts: '2026-07-31T00:00:00.000Z',
    };
    hub.publishPosition(position);
    hub.publishPosition(position);

    expect(lagging.closed?.code).toBe(1013);
    expect(lagging.closed?.reason).toMatch(/slow consumer/i);
    expect(healthy.sent).toHaveLength(2);
    expect(JSON.parse(healthy.sent[0]!).channel).toBe('positions');
  });
});
