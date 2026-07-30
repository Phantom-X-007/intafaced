import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { PrivateOrderHub } from './hub.js';
import { createPrivateWebSocketGateway, PRIVATE_STREAM_PATH, type PrivateWebSocketGateway } from './gateway.js';

const SECRET = 'test-access-secret-at-least-32-chars!!';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const tokens: TokenConfig = {
  secret: SECRET,
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

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

  async closure(): Promise<{ code: number; reason: string }> {
    if (this.closed) return this.closed;
    await new Promise<void>((resolve) => this.socket.once('close', () => resolve()));
    return this.closed!;
  }
}

describe('private WebSocket gateway', () => {
  let server: Server;
  let hub: PrivateOrderHub;
  let gateway: PrivateWebSocketGateway;
  let baseUrl: string;
  let enabled = true;

  afterEach(async () => {
    enabled = true;
    await gateway?.close('test done');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function boot(opts: { tokens: TokenConfig | null } = { tokens }): Promise<void> {
    hub = new PrivateOrderHub({ highWaterBytes: 1_000_000, maxLagTicks: 5, maxConnections: 10 });
    server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    baseUrl = `ws://127.0.0.1:${addr.port}`;
    gateway = createPrivateWebSocketGateway({
      server,
      hub,
      heartbeatMs: 30_000,
      log: { info: () => undefined, warn: () => undefined },
      enabled: () => enabled,
      tokens: opts.tokens,
    });
  }

  it('sends orders + fills + positions ready frames, then position updates', async () => {
    await boot();
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:read'] }, tokens);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);

    const ready = client.frames.map((f) => JSON.parse(f) as { channel: string; type: string; userId: string });
    expect(ready.map((r) => r.channel).sort()).toEqual(['fills', 'orders', 'positions']);
    for (const frame of ready) {
      expect(frame.type).toBe('ready');
      expect(frame.userId).toBe(USER);
    }

    hub.publishPosition({
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: USER,
      marketId: 'btc-usdt-perp',
      symbol: 'BTC/USDT:USDT',
      status: 'open',
      side: 'long',
      contracts: '1',
      entryPrice: '100',
      markPrice: '101',
      notional: '101',
      leverage: '2',
      collateral: '50.5',
      unrealizedPnl: '1',
      realizedPnl: '0',
      liquidationPrice: '80',
      marginMode: 'cross',
      fundingPaid: '0',
      ts: '2026-07-31T00:00:00.000Z',
    });
    await client.frameCount(4);
    const update = JSON.parse(client.frames[3]!);
    expect(update.channel).toBe('positions');
    expect(update.contracts).toBe('1');
    expect(update.userId).toBe(USER);
    client.socket.close();
  });

  it("never delivers another user's position over the socket", async () => {
    await boot();
    const { token } = await issueAccessToken({ userId: USER, sessionId: SESSION, scopes: ['trade:write'] }, tokens);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);

    hub.publishPosition({
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      marketId: 'btc-usdt-perp',
      symbol: 'BTC/USDT:USDT',
      status: 'open',
      side: 'short',
      contracts: '9',
      entryPrice: '1',
      markPrice: '1',
      notional: '9',
      leverage: '1',
      collateral: '9',
      unrealizedPnl: '0',
      realizedPnl: '0',
      liquidationPrice: null,
      marginMode: 'isolated',
      fundingPaid: '0',
      ts: '2026-07-31T00:00:00.000Z',
    });

    // Give the event loop a tick — nothing should arrive.
    await new Promise((r) => setTimeout(r, 50));
    expect(client.frames).toHaveLength(3);
    client.socket.close();
  });

  it('rejects upgrade without a token', async () => {
    await boot();
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}`);
    // Non-upgrade HTTP rejection closes the socket abruptly (no WS close code).
    await new Promise<void>((resolve) => client.socket.once('close', () => resolve()));
    expect(client.frames).toHaveLength(0);
  });

  it('rejects when private tokens are not configured', async () => {
    await boot({ tokens: null });
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=anything`);
    await new Promise<void>((resolve) => client.socket.once('close', () => resolve()));
    expect(client.frames).toHaveLength(0);
  });
});
