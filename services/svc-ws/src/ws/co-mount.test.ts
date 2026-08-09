/**
 * Public + private gateways co-mounted on one HTTP server — production boot shape.
 * Proves public demux does not 404 /private/stream before private auth runs.
 */
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { DepthHub } from '../depth/hub.js';
import type { DepthSource } from '../depth/source.js';
import { PrivateOrderHub } from '../private/hub.js';
import { createPrivateWebSocketGateway, PRIVATE_STREAM_PATH } from '../private/gateway.js';
import { TradeHub } from '../trade/hub.js';
import { createWebSocketGateway, STREAM_PATH } from './gateway.js';

const SECRET = 'test-access-secret-at-least-32-chars!!';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MARKET = 'BTC-USDT';

const tokens: TokenConfig = {
  secret: SECRET,
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

class StubSource implements DepthSource {
  async markets() {
    return [MARKET];
  }
  async snapshot(marketId: string) {
    return { type: 'snapshot' as const, marketId, sequence: 1, bids: [['100', '1']], asks: [['101', '1']] };
  }
}

async function upgradeStatus(url: string): Promise<number> {
  const socket = new WebSocket(url);
  return new Promise<number>((resolve) => {
    socket.on('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
      socket.terminate();
    });
    socket.on('error', () => resolve(0));
    socket.on('open', () => {
      socket.terminate();
      resolve(101);
    });
  });
}

describe('public + private WS co-mount (production shape)', () => {
  let server: Server;
  const log = { info: vi.fn(), warn: vi.fn() };

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('private stream reaches auth (401 without token); public stream still works', async () => {
    server = createServer();
    const source = new StubSource();
    const depthHub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      log,
    });
    const tradeHub = new TradeHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });
    const privateHub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });

    createWebSocketGateway({
      server,
      hub: depthHub,
      tradeHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => true,
    });
    createPrivateWebSocketGateway({
      server,
      hub: privateHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => true,
      tokens,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no listen address');
    const base = `127.0.0.1:${addr.port}`;

    // Public market stream still upgrades.
    expect(await upgradeStatus(`ws://${base}${STREAM_PATH}?market=${MARKET}`)).toBe(101);

    // Private without token is private's 401 — not public's 404.
    expect(await upgradeStatus(`ws://${base}${PRIVATE_STREAM_PATH}`)).toBe(401);

    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:read'] }, tokens);
    expect(await upgradeStatus(`ws://${base}${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(101);

    // Unknown path still 404 from public demux.
    expect(await upgradeStatus(`ws://${base}/nope`)).toBe(404);
  });

  it('public stream ignores a junk access_token and still upgrades', async () => {
    server = createServer();
    const source = new StubSource();
    const depthHub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      log,
    });
    const tradeHub = new TradeHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });
    const privateHub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });

    createWebSocketGateway({
      server,
      hub: depthHub,
      tradeHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => true,
    });
    createPrivateWebSocketGateway({
      server,
      hub: privateHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => true,
      tokens,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no listen address');
    const base = `127.0.0.1:${addr.port}`;

    // Public path never authenticates — a query token is noise, not a gate.
    expect(await upgradeStatus(`ws://${base}${STREAM_PATH}?market=${MARKET}&access_token=not-a-jwt`)).toBe(101);
  });

  it('kill-switch refuses both public and private upgrades with 503', async () => {
    server = createServer();
    const source = new StubSource();
    const depthHub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      log,
    });
    const tradeHub = new TradeHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });
    const privateHub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });
    let enabled = false;

    createWebSocketGateway({
      server,
      hub: depthHub,
      tradeHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => enabled,
    });
    createPrivateWebSocketGateway({
      server,
      hub: privateHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => enabled,
      tokens,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no listen address');
    const base = `127.0.0.1:${addr.port}`;

    expect(await upgradeStatus(`ws://${base}${STREAM_PATH}?market=${MARKET}`)).toBe(503);

    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:read'] }, tokens);
    expect(await upgradeStatus(`ws://${base}${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(503);
  });

  it('private stream never serves public depth frames', async () => {
    server = createServer();
    const source = new StubSource();
    const depthHub = new DepthHub(source, {
      depthLimit: 50,
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      log,
    });
    const tradeHub = new TradeHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });
    const privateHub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, log });

    createWebSocketGateway({
      server,
      hub: depthHub,
      tradeHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => true,
    });
    createPrivateWebSocketGateway({
      server,
      hub: privateHub,
      heartbeatMs: 30_000,
      log,
      enabled: () => true,
      tokens,
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no listen address');
    const base = `127.0.0.1:${addr.port}`;

    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:read'] }, tokens);
    const frames: unknown[] = [];
    const ws = new WebSocket(`ws://${base}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout waiting for private ready')), 5_000);
      ws.on('message', (data) => {
        frames.push(JSON.parse(data.toString()));
        if (frames.length >= 3) {
          clearTimeout(t);
          resolve();
        }
      });
      ws.on('error', reject);
    });
    ws.terminate();

    // Three ready frames only — no depth snapshot/delta shape.
    expect(frames).toHaveLength(3);
    for (const f of frames) {
      expect(f).toMatchObject({ type: 'ready' });
      expect(f).not.toMatchObject({ type: 'snapshot' });
      expect(f).not.toHaveProperty('bids');
      expect(f).not.toHaveProperty('asks');
    }
  });
});
