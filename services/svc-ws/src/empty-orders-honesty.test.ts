import { describe, expect, it } from 'vitest';
import type { DepthSnapshot } from '@intafaced/market-data';
import { CLOSE_POLICY, DepthHub, type DepthSink } from './depth/hub.js';
import type { DepthSource } from './depth/source.js';
import { ORDERS_ENGINE_UNAVAILABLE } from './gateway-policy.js';
import {
  isLiveZeroBlotterFrame,
  ORDERS_ENGINE_UNAVAILABLE as PRIVATE_ORDERS_ENGINE_UNAVAILABLE,
  PrivateNoBlotterError,
  PrivateOrderHub,
  type PrivateFillUpdate,
  type PrivateOrderUpdate,
  type PrivatePositionUpdate,
  type PrivateSink,
} from './private/hub.js';

/**
 * Empty ≠ zero. A private orders/positions hub must not emit `{ orders: [] }`
 * or `{ positions: [] }` (or JSON `[]`) that a client can read as a live zero
 * blotter. Matching 404 / seed failure is absence. Unknown markets stay a
 * typed close. No invented fills.
 */

const MARKET = 'BTC-USDT';

function liveSnapshot(sequence: number, marketId = MARKET): DepthSnapshot {
  return { type: 'snapshot', marketId, sequence, bids: [['100', '1']], asks: [['101', '1']] };
}

function order(userId = 'user-a'): PrivateOrderUpdate {
  return {
    orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId,
    marketId: MARKET,
    status: 'open',
    side: 'buy',
    type: 'limit',
    qty: '1',
    filledQty: '0',
    price: '100',
    clientOrderId: null,
    ts: '2026-07-30T00:00:00.000Z',
  };
}

function position(userId = 'user-a'): PrivatePositionUpdate {
  return {
    positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userId,
    marketId: 'BTC-USDT-PERP',
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
}

class FakeSink implements DepthSink, PrivateSink {
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

function depthHub(source: FakeSource) {
  return new DepthHub(source, {
    depthLimit: 50,
    highWaterBytes: 1_000,
    maxLagTicks: 3,
    maxConnections: 100,
    marketsRefreshMs: 0,
  });
}

/** Done-bar: a client must not be able to read [] as a live zero blotter. */
function expectNoLiveZeroBlotter(frames: readonly string[]): void {
  for (const frame of frames) {
    expect(isLiveZeroBlotterFrame(frame), `live zero blotter on the wire: ${frame}`).toBe(false);
  }
}

function expectNoInventedFills(frames: readonly string[]): void {
  for (const frame of frames) {
    const parsed = JSON.parse(frame) as { channel?: string; fillId?: string; type?: string };
    expect(parsed.channel === 'fills' && parsed.type !== 'ready', `invented fill on the wire: ${frame}`).toBe(false);
    expect(parsed, `invented fillId on the wire: ${frame}`).not.toHaveProperty('fillId');
  }
}

describe('isLiveZeroBlotterFrame', () => {
  it('treats [] and empty orders/positions/fills wrappers as a live zero blotter', () => {
    expect(isLiveZeroBlotterFrame('[]')).toBe(true);
    expect(isLiveZeroBlotterFrame('{"orders":[]}')).toBe(true);
    expect(isLiveZeroBlotterFrame('{"type":"orders","orders":[]}')).toBe(true);
    expect(isLiveZeroBlotterFrame('{"positions":[]}')).toBe(true);
    expect(isLiveZeroBlotterFrame('{"type":"positions","positions":[]}')).toBe(true);
    expect(isLiveZeroBlotterFrame('{"fills":[]}')).toBe(true);
  });

  it('does not flag a real order, position, ready, or engine-unavailable status frame', () => {
    expect(isLiveZeroBlotterFrame(JSON.stringify({ channel: 'orders', ...order() }))).toBe(false);
    expect(isLiveZeroBlotterFrame(JSON.stringify({ channel: 'positions', ...position() }))).toBe(false);
    expect(isLiveZeroBlotterFrame(JSON.stringify({ channel: 'orders', type: 'ready', userId: 'user-a', bus: false }))).toBe(false);
    expect(isLiveZeroBlotterFrame(JSON.stringify({ channel: 'orders', type: 'snapshot', userId: 'user-a', orders: [] }))).toBe(false);
    expect(
      isLiveZeroBlotterFrame(JSON.stringify({ type: 'status', code: ORDERS_ENGINE_UNAVAILABLE, channel: 'orders', userId: 'user-a' })),
    ).toBe(false);
  });
});

describe('empty orders blotter is absent, not a zero book', () => {
  it('does not emit { orders: [] } when a seat is unseeded', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('does not emit { orders: [] } when matching 404s / no-blotter seed', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
      seedOrders: async (userId) => {
        throw new PrivateNoBlotterError(userId);
      },
      seedPositions: async () => {
        throw new Error('svc-matching 404: no positions');
      },
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expect(hub.matchingAvailable).toBe(true);
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('names orders.engine_unavailable when matching is down — not a blank blotter', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
      seedOrders: async () => {
        throw new Error('svc-matching unreachable');
      },
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(hub.matchingAvailable).toBe(false);
    expect(hub.engineCode).toBe(ORDERS_ENGINE_UNAVAILABLE);
    expect(sink.frames.map((f) => JSON.parse(f))).toEqual([
      { type: 'status', code: ORDERS_ENGINE_UNAVAILABLE, channel: 'orders', userId: 'user-a' },
    ]);
    expect(PRIVATE_ORDERS_ENGINE_UNAVAILABLE).toBe(ORDERS_ENGINE_UNAVAILABLE);
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('names orders.engine_unavailable on private seats when public depth matching-down flips', async () => {
    const privateHub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
    });
    const privateSink = new FakeSink();
    privateHub.attach('user-a', privateSink);

    const source = new FakeSource([MARKET], new Map(), new Error('svc-matching unreachable'));
    const depth = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      marketsRefreshMs: 0,
      onMatchingAvailabilityChange: (available) => {
        if (available) privateHub.noteEngineUp();
        else privateHub.markEngineUnavailable();
      },
    });
    const depthSink = new FakeSink();
    depth.attach(MARKET, depthSink);
    await settle();

    expect(depth.matchingAvailable).toBe(false);
    expect(privateHub.engineCode).toBe(ORDERS_ENGINE_UNAVAILABLE);
    expect(privateSink.frames.map((f) => JSON.parse(f))).toEqual([
      { type: 'status', code: ORDERS_ENGINE_UNAVAILABLE, channel: 'orders', userId: 'user-a' },
    ]);
    expectNoLiveZeroBlotter(privateSink.frames);
    expectNoInventedFills(privateSink.frames);
  });

  it('does not emit { orders: [] } or { positions: [] } when seed returns empty', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
      seedOrders: async () => [],
      seedPositions: async () => [],
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    expect(sink.closed).toBeNull();
    expect(sink.frames).toEqual([]);
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('closes an unknown market — typed close, no fabricated empty blotter', async () => {
    const source = new FakeSource([MARKET], new Map([[MARKET, liveSnapshot(10)]]));
    const depth = depthHub(source);
    const sink = new FakeSink();
    depth.attach('NOPE', sink);
    await settle();

    expect(sink.closed).toEqual({ code: CLOSE_POLICY, reason: 'ws.close.unknown_market' });
    expect(sink.frames).toEqual([]);
    expectNoLiveZeroBlotter(sink.frames);
  });

  it('publishes the first real order, never an empty blotter object', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
      seedOrders: async () => [],
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    hub.publish(order());

    expect(JSON.parse(sink.frames[0]!)).toMatchObject({
      channel: 'orders',
      orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      marketId: MARKET,
      qty: '1',
    });
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('publishes the first real position, never an empty positions wrapper', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
      seedPositions: async () => [],
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    hub.publishPosition(position());

    expect(JSON.parse(sink.frames[0]!)).toMatchObject({
      channel: 'positions',
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      contracts: '2',
    });
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('replays a non-empty seed as real rows, never wrapping [] as a live blotter', async () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
      seedOrders: async () => [order()],
      seedPositions: async () => [position()],
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    await settle();

    expect(JSON.parse(sink.frames[0]!)).toMatchObject({ channel: 'orders', orderId: order().orderId });
    expect(JSON.parse(sink.frames[1]!)).toMatchObject({ channel: 'positions', positionId: position().positionId });
    expectNoLiveZeroBlotter(sink.frames);
    expectNoInventedFills(sink.frames);
  });

  it('refuses to fan a fabricated empty blotter even if publish is handed one', () => {
    const hub = new PrivateOrderHub({
      highWaterBytes: 1_000,
      maxLagTicks: 3,
      maxConnections: 100,
      maxConnectionsPerUser: 100,
    });
    const sink = new FakeSink();
    hub.attach('user-a', sink);
    hub.publish({ ...order(), orders: [] } as PrivateOrderUpdate & { orders: [] });
    hub.publishPosition({ ...position(), positions: [] } as PrivatePositionUpdate & { positions: [] });
    hub.publishFill({
      fillId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      orderId: order().orderId,
      userId: 'user-a',
      marketId: MARKET,
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
      fills: [],
    } as PrivateFillUpdate & { fills: [] });

    expect(sink.frames).toEqual([]);
    expectNoLiveZeroBlotter(sink.frames);
  });
});
