import { describe, expect, it, vi } from 'vitest';
import { MemoryEventBus, validatePayload, type EventBus, type Subscription } from '@intafaced/events';
import { PrivateOrderHub } from '../private/hub.js';
import { subscribePrivateFills, tryAttachPrivate } from '../private/source.js';
import { DropCopyHub } from './hub.js';
import { subscribeDropCopyFills, tryAttachDropCopy } from './source.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function settled(fillId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') {
  return validatePayload('fillSettled', {
    fillId,
    orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    userId: USER,
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
  });
}

describe('drop-copy bus source', () => {
  it('maps fillSettled onto drop_copy with decimal strings and independent seq', async () => {
    const bus = new MemoryEventBus('svc-ws-drop-copy-src');
    const hub = new DropCopyHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
      recentLimit: 10,
    });
    hub.announceBus(true);
    const alice = sink();
    hub.attach(USER, alice);
    const before = alice.sent.length;

    await subscribeDropCopyFills({ bus, hub, durable: 'ws-drop-copy-src' });
    await bus.publish('fillSettled', settled());

    const live = alice.sent.slice(before).map((f) => JSON.parse(f) as Record<string, unknown>);
    expect(live.filter((f) => f.type === 'execution')).toHaveLength(1);
    const frame = live.find((f) => f.type === 'execution')!;
    expect(frame.channel).toBe('drop_copy');
    expect(frame.channel).not.toBe('fills');
    expect(frame.dropCopySeq).toBe(1);
    expect(frame.engineSequence).toBe(7);
    expect(typeof frame.price).toBe('string');
    expect(typeof frame.qty).toBe('string');
    expect(typeof frame.feeAmount).toBe('string');
  });

  it('does not invent an execution when nothing is published', async () => {
    const bus = new MemoryEventBus('svc-ws-drop-copy-silent');
    const hub = new DropCopyHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
      recentLimit: 10,
    });
    hub.announceBus(true);
    const alice = sink();
    hub.attach(USER, alice);
    const before = alice.sent.length;
    await subscribeDropCopyFills({ bus, hub, durable: 'ws-drop-copy-silent' });
    expect(alice.sent.slice(before)).toEqual([]);
  });

  it('keeps delivering when the private trading attach fails', async () => {
    const bus = {
      subscribe: vi.fn(async (subject: string) => {
        if (subject === 'orderUpdated') throw new Error('private orders durable missing');
        return { unsubscribe: async () => undefined } satisfies Subscription;
      }),
    } as unknown as EventBus;
    const privateHub = new PrivateOrderHub({ highWaterBytes: 1_000, maxLagTicks: 3, maxConnections: 8, maxConnectionsPerUser: 8 });
    const dropHub = new DropCopyHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
      recentLimit: 10,
    });

    const privateHalf = await tryAttachPrivate({ bus, hub: privateHub, durable: 'ws-private-fail' });
    const dropHalf = await tryAttachDropCopy({ bus, hub: dropHub, durable: 'ws-drop-copy-ok' });

    expect(privateHalf).toBeNull();
    expect(dropHalf).not.toBeNull();
  });

  it('private fills channel and drop-copy do not share a hub — same fill fans independently', async () => {
    const bus = new MemoryEventBus('svc-ws-drop-copy-indep');
    const privateHub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10, maxConnectionsPerUser: 10 });
    const dropHub = new DropCopyHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 10,
      maxConnectionsPerUser: 10,
      recentLimit: 10,
    });
    dropHub.announceBus(true);
    const trading = sink();
    const copy = sink();
    privateHub.attach(USER, trading);
    dropHub.attach(USER, copy);

    await subscribePrivateFills({ bus, hub: privateHub, durable: 'ws-private-fills-indep' });
    await subscribeDropCopyFills({ bus, hub: dropHub, durable: 'ws-drop-copy-indep' });
    await bus.publish('fillSettled', settled());

    const tradeFill = trading.sent.map((f) => JSON.parse(f) as Record<string, unknown>).find((f) => f.channel === 'fills' && f.fillId);
    const dropFill = copy.sent
      .map((f) => JSON.parse(f) as Record<string, unknown>)
      .find((f) => f.channel === 'drop_copy' && f.type === 'execution');
    expect(tradeFill).toBeDefined();
    expect(dropFill).toBeDefined();
    expect(dropFill!.dropCopySeq).toBe(1);
    expect(tradeFill).not.toHaveProperty('dropCopySeq');
  });
});
