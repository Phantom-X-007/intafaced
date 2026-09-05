/**
 * Poll is not push. Depth / native L3 poll matching HTTP.
 * A push ask on those doors must 409 — never a live snapshot.
 */
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import type { DepthSnapshot } from '@intafaced/market-data';
import { DepthHub } from './depth/hub.js';
import { NativeL3Hub } from './depth/l3-hub.js';
import type { DepthSource, NativeL3Queue } from './depth/source.js';
import { DEPTH_PUSH_UNAVAILABLE, DEPTH_TRANSPORT_POLL, MARKET_DATA_FEED_REFUSE_HTTP, TRADES_TRANSPORT_PUSH } from './gateway-policy.js';
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

  async markets(): Promise<readonly string[]> {
    return this.marketList;
  }

  async snapshot(marketId: string): Promise<DepthSnapshot> {
    this.snapshotCalls.push(marketId);
    return {
      type: 'snapshot',
      marketId,
      sequence: 10,
      bids: [['99.5', '0.5']],
      asks: [['100.5', '1.25']],
    };
  }

  async l3Queue(marketId: string): Promise<NativeL3Queue> {
    this.l3Calls.push(marketId);
    return { ...native, marketId };
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

describe('push vs poll honesty', () => {
  let app: FastifyInstance;
  let hub: DepthHub;
  let l3Hub: NativeL3Hub;
  let source: Source;
  let gateway: WebSocketGateway;
  let base: string;

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
      maxConnectionsPerUser: 8,
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
      pollMs: 250,
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
    await gateway.close('test over');
    await app.close();
  });

  it('/policy and /health name poll on depth/L3 and push on trades', async () => {
    const policy = await app.inject({ method: 'GET', url: '/policy' });
    expect(policy.json()).toMatchObject({
      depthTransport: DEPTH_TRANSPORT_POLL,
      l3Transport: DEPTH_TRANSPORT_POLL,
      tradesTransport: TRADES_TRANSPORT_PUSH,
      depthPush: false,
      l3Push: false,
      noSynthesizeL3FromL2: true,
    });
    expect(policy.json().refuseCodes).toContain(DEPTH_PUSH_UNAVAILABLE);

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toMatchObject({
      depthTransport: DEPTH_TRANSPORT_POLL,
      l3Transport: DEPTH_TRANSPORT_POLL,
      tradesTransport: TRADES_TRANSPORT_PUSH,
      pollMs: 250,
    });

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.json()).toMatchObject({
      depthTransport: DEPTH_TRANSPORT_POLL,
      l3Transport: DEPTH_TRANSPORT_POLL,
      tradesTransport: TRADES_TRANSPORT_PUSH,
      pollMs: 250,
    });
  });

  it('WS/HTTP push ask on depth and L3 is 409 and does not attach L2 or copy L3 from L2', async () => {
    for (const query of [
      `market=${MARKET}&transport=push`,
      `market=${MARKET}&channel=l3&transport=push`,
      `market=${MARKET}&channel=push`,
      `market=${MARKET}&mode=push`,
    ]) {
      const refused = await upgradeRefuse(`ws://${base}/stream?${query}`);
      expect(refused.status).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
      expect(refused.body).toMatchObject({ type: 'status', code: DEPTH_PUSH_UNAVAILABLE });
    }
    expect(hub.connections).toBe(0);
    expect(l3Hub.connections).toBe(0);
    expect(source.snapshotCalls).toEqual([]);
    expect(source.l3Calls).toEqual([]);

    const httpL2 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?transport=push` });
    expect(httpL2.statusCode).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
    expect(httpL2.json()).toMatchObject({ type: 'status', code: DEPTH_PUSH_UNAVAILABLE });
    expect(httpL2.json()).not.toHaveProperty('bids');

    const httpL3 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3?transport=push` });
    expect(httpL3.statusCode).toBe(MARKET_DATA_FEED_REFUSE_HTTP);
    expect(httpL3.json()).toMatchObject({ type: 'status', code: DEPTH_PUSH_UNAVAILABLE });
    expect(httpL3.json()).not.toHaveProperty('bids');
  });
});
