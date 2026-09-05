/**
 * H2 WS: project matching native L3. Never copy L2 size tuples.
 */
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import type { DepthSnapshot } from '@intafaced/market-data';
import { DepthHub } from './depth/hub.js';
import { NativeL3Hub } from './depth/l3-hub.js';
import { DepthL3UnavailableError, type DepthSource, type NativeL3Queue } from './depth/source.js';
import { DEPTH_BINARY_UNAVAILABLE, DEPTH_L3_UNAVAILABLE, MARKET_DATA_FEED_REFUSE_HTTP } from './gateway-policy.js';
import { PrivateOrderHub } from './private/hub.js';
import { registerRoutes } from './routes.js';
import { TradeHub } from './trade/hub.js';
import { createWebSocketGateway, type WebSocketGateway } from './ws/gateway.js';

const MARKET = 'BTC-USDT';

const native: NativeL3Queue = {
  level: 'L3',
  marketId: MARKET,
  bids: [{ price: '99.5', orders: [{ orderId: 'b1', remaining: '0.5', sequence: 1 }] }],
  asks: [{ price: '100.5', orders: [{ orderId: 'a1', remaining: '1.25', sequence: 2 }] }],
};

class Source implements DepthSource {
  marketList: string[] = [MARKET];
  snapshotCalls: string[] = [];
  l3Calls: string[] = [];
  queue: NativeL3Queue | DepthL3UnavailableError = native;
  l2: DepthSnapshot = {
    type: 'snapshot',
    marketId: MARKET,
    sequence: 10,
    bids: [['99.5', '0.5']],
    asks: [['100.5', '1.25']],
  };

  async markets(): Promise<readonly string[]> {
    return this.marketList;
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    this.snapshotCalls.push(marketId);
    return { ...this.l2, marketId };
  }

  async l3Queue(marketId: string): Promise<NativeL3Queue> {
    this.l3Calls.push(marketId);
    if (this.queue instanceof DepthL3UnavailableError) throw this.queue;
    return { ...this.queue, marketId };
  }
}

class Client {
  readonly socket: WebSocket;
  readonly frames: string[] = [];
  closed: { code: number; reason: string } | null = null;
  readonly #waiters: Array<{ count: number; resolve: () => void }> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (data) => {
      this.frames.push(data.toString());
      this.#settle();
    });
    this.socket.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.#settle();
    });
    this.socket.on('error', () => undefined);
  }

  #settle(): void {
    for (const waiter of [...this.#waiters]) {
      if (this.frames.length >= waiter.count || this.closed) {
        this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  }

  async frameCount(count: number): Promise<void> {
    if (this.frames.length >= count || this.closed) return;
    await new Promise<void>((resolve) => this.#waiters.push({ count, resolve }));
  }

  parsed(): Array<Record<string, unknown>> {
    return this.frames.map((f) => JSON.parse(f) as Record<string, unknown>);
  }

  dispose(): void {
    this.socket.terminate();
  }
}

async function upgradeRefuse(url: string): Promise<{ status: number; body: unknown }> {
  const socket = new WebSocket(url);
  return new Promise((resolve) => {
    socket.on('unexpected-response', (_req, res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        socket.terminate();
        let body: unknown = null;
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
        }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    socket.on('open', () => {
      socket.terminate();
      resolve({ status: 101, body: null });
    });
    socket.on('error', () => resolve({ status: 0, body: null }));
  });
}

describe('H2 native L3 projection', () => {
  let app: FastifyInstance;
  let hub: DepthHub;
  let l3Hub: NativeL3Hub;
  let source: Source;
  let gateway: WebSocketGateway;
  let base: string;
  const clients: Client[] = [];

  beforeEach(async () => {
    source = new Source();
    app = Fastify({ logger: false });
    hub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 8,
      marketsRefreshMs: 0,
    });
    l3Hub = new NativeL3Hub(source, {
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 8,
      ensureKnownMarket: (id) => hub.ensureKnownMarket(id),
    });
    const tradeHub = new TradeHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 8,
      recentLimit: 10,
      ensureKnownMarket: (id) => hub.ensureKnownMarket(id),
    });
    const privateHub = new PrivateOrderHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: 8,
    });
    registerRoutes(app, {
      hub,
      l3Hub,
      tradeHub,
      privateHub,
      source,
      depthLimit: 50,
      serviceName: 'svc-ws-test',
      upstream: 'http://matching.test',
      enabled: () => true,
      tradesBus: () => true,
      privateBus: () => true,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    base = `127.0.0.1:${port}`;
    gateway = createWebSocketGateway({
      server: app.server,
      hub,
      tradeHub,
      l3Hub,
      heartbeatMs: 60_000,
      log: { info: vi.fn(), warn: vi.fn() },
      enabled: () => true,
    });
    await hub.refreshMarkets();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.dispose();
    await gateway.close('test over');
    await app.close();
  });

  it('WS channel=l3 projects matching queue, not L2 size tuples', async () => {
    const client = new Client(`ws://${base}/stream?market=${MARKET}&channel=l3`);
    clients.push(client);
    await client.frameCount(1);
    expect(client.closed).toBeNull();
    expect(client.parsed()[0]).toMatchObject({ type: 'snapshot', transport: 'poll', level: 'L3', marketId: MARKET });
    expect(client.parsed()[0]!.asks).toEqual(native.asks);
    expect(client.parsed()[0]!.asks).not.toEqual(source.l2.asks);
    expect(source.l3Calls).toContain(MARKET);
    expect(source.snapshotCalls).toEqual([]);
    expect(hub.connections).toBe(0);
    expect(l3Hub.connections).toBe(1);
  });

  it('GET /depth/l3 is native queue; GET /depth stays L2 tuples', async () => {
    const l3 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3` });
    expect(l3.statusCode).toBe(200);
    expect(l3.json()).toMatchObject({ level: 'L3', transport: 'poll', asks: native.asks });
    expect(l3.json().asks).not.toEqual([['100.5', '1.25']]);

    const viaQuery = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?channel=l3` });
    expect(viaQuery.statusCode).toBe(200);
    expect(viaQuery.json().level).toBe('L3');
    expect(viaQuery.json().transport).toBe('poll');
    expect(viaQuery.json().asks[0].orders[0].remaining).toBe('1.25');

    const l2 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth` });
    expect(l2.statusCode).toBe(200);
    expect(l2.json().asks).toEqual([['100.5', '1.25']]);
    expect(l2.json().level).toBeUndefined();
    expect(source.snapshotCalls.length).toBeGreaterThan(0);
  });

  it('matching l3_unavailable refuses and does not attach L2', async () => {
    source.queue = new DepthL3UnavailableError(MARKET);
    const refused = await upgradeRefuse(`ws://${base}/stream?market=${MARKET}&channel=l3`);
    expect(refused.status).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
    expect(refused.body).toMatchObject({ type: 'status', code: DEPTH_L3_UNAVAILABLE });
    expect(hub.connections).toBe(0);
    expect(l3Hub.connections).toBe(0);
    expect(source.snapshotCalls).toEqual([]);

    const http = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3` });
    expect(http.statusCode).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
    expect(http.json()).toMatchObject({ type: 'status', code: DEPTH_L3_UNAVAILABLE });
    expect(http.json()).not.toHaveProperty('bids');
  });

  it('queue-probability stays refused; L3+SBE is binary not L2 SBE', async () => {
    const prob = await upgradeRefuse(`ws://${base}/stream?market=${MARKET}&channel=queue-probability`);
    expect(prob.status).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
    expect(prob.body).toMatchObject({ type: 'status', code: DEPTH_L3_UNAVAILABLE });

    const sbe = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?channel=l3&format=sbe` });
    expect(sbe.statusCode).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
    expect(sbe.json()).toMatchObject({ type: 'status', code: DEPTH_BINARY_UNAVAILABLE });
    expect(sbe.json()).not.toHaveProperty('bids');
  });
});
