import { describe, expect, it, vi } from 'vitest';
import { PrivateOrderHub, type PrivateOrderUpdate } from './hub.js';

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

  it('refuses attach when at capacity', () => {
    const hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 1 });
    const first = sink();
    const second = sink();
    hub.attach('user-a', first);
    hub.attach('user-b', second);
    expect(second.closed?.code).toBe(1013);
    expect(hub.connections).toBe(1);
  });
});
