import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { PrivateOrderHub } from './hub.js';
import { createPrivateWebSocketGateway, PRIVATE_STREAM_PATH, type PrivateWebSocketGateway } from './gateway.js';

const SECRET = 'test-access-secret-at-least-32-chars!!';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
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

  constructor(url: string, headers?: Record<string, string>) {
    this.socket = new WebSocket(url, { headers });
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

  async openOrClose(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN || this.closed) return;
    await new Promise<void>((resolve) => {
      this.socket.once('open', () => resolve());
      this.socket.once('close', () => resolve());
    });
  }
}

describe('private WebSocket gateway', () => {
  let server: Server;
  let hub: PrivateOrderHub;
  let gateway: PrivateWebSocketGateway;
  let baseUrl: string;
  let httpHost: string;
  let httpPort: number;
  let enabled = true;

  afterEach(async () => {
    enabled = true;
    await gateway?.close('test done');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function boot(
    opts: {
      tokens: TokenConfig | null;
      maxConnections?: number;
      maxConnectionsPerUser?: number;
      heartbeatMs?: number;
    } = { tokens },
  ): Promise<void> {
    hub = new PrivateOrderHub({
      highWaterBytes: 1_000_000,
      maxLagTicks: 5,
      maxConnections: opts.maxConnections ?? 10,
      maxConnectionsPerUser: opts.maxConnectionsPerUser,
    });
    server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    httpHost = '127.0.0.1';
    httpPort = addr.port;
    baseUrl = `ws://127.0.0.1:${addr.port}`;
    gateway = createPrivateWebSocketGateway({
      server,
      hub,
      heartbeatMs: opts.heartbeatMs ?? 30_000,
      log: { info: () => undefined, warn: () => undefined },
      enabled: () => enabled,
      tokens: opts.tokens,
    });
  }

  async function accessToken(scopes: string[], cfg: TokenConfig = tokens, userId: string = USER): Promise<string> {
    const { token } = await issueAccessToken({ userId, sessionId: SESSION, scopes }, cfg);
    return token;
  }

  /**
   * Raw HTTP upgrade probe — fail-closed must refuse BEFORE the WebSocket
   * handshake completes, with an explicit status (not a silent drop).
   */
  function upgradeStatus(path: string, headers: Record<string, string> = {}): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: httpHost,
          port: httpPort,
          path,
          method: 'GET',
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            ...headers,
          },
        },
        (res) => {
          resolve(res.statusCode ?? 0);
          res.resume();
        },
      );
      req.on('upgrade', (_res, socket) => {
        socket.destroy();
        resolve(101);
      });
      req.on('error', reject);
      req.end();
    });
  }

  // ── Auth fail-closed (status codes proven on the upgrade path) ─────────────

  it('rejects upgrade without a token with HTTP 401', async () => {
    await boot();
    expect(await upgradeStatus(PRIVATE_STREAM_PATH)).toBe(401);
  });

  it('rejects garbage token with HTTP 401', async () => {
    await boot();
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=not-a-jwt`)).toBe(401);
  });

  it('rejects expired token with HTTP 401', async () => {
    await boot();
    const shortLived: TokenConfig = { ...tokens, accessTtlSeconds: 1 };
    const token = await accessToken(['trade:read'], shortLived);
    await new Promise((r) => setTimeout(r, 1_100));
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(401);
  });

  it('rejects token signed with the wrong secret with HTTP 401', async () => {
    await boot();
    const other: TokenConfig = { ...tokens, secret: 'different-secret-also-32-chars-min!!' };
    const token = await accessToken(['trade:read'], other);
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(401);
  });

  it('rejects wrong audience with HTTP 401', async () => {
    await boot();
    const wrongAud: TokenConfig = { ...tokens, audience: 'not.the.api' };
    const token = await accessToken(['trade:read'], wrongAud);
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(401);
  });

  it('rejects scopes without trade:read or trade:write with HTTP 403', async () => {
    await boot();
    const token = await accessToken(['pay:read', 'wallet:read']);
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(403);
  });

  it('rejects when private tokens are not configured with HTTP 403', async () => {
    await boot({ tokens: null });
    const token = await accessToken(['trade:read']);
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(403);
  });

  it('rejects when kill-switch is off with HTTP 503', async () => {
    await boot();
    enabled = false;
    const token = await accessToken(['trade:read']);
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=${token}`)).toBe(503);
  });

  it('rejects whitespace-only access_token with HTTP 401', async () => {
    await boot();
    expect(await upgradeStatus(`${PRIVATE_STREAM_PATH}?access_token=%20%20`)).toBe(401);
  });

  // ── Happy path + channel catalog ───────────────────────────────────────────

  it('accepts trade:read and sends orders + fills + positions ready frames', async () => {
    await boot();
    const token = await accessToken(['trade:read']);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);

    const ready = client.frames.map((f) => JSON.parse(f) as { channel: string; type: string; userId: string });
    expect(ready.map((r) => r.channel).sort()).toEqual(['fills', 'orders', 'positions']);
    for (const frame of ready) {
      expect(frame.type).toBe('ready');
      expect(frame.userId).toBe(USER);
    }
    client.socket.close();
  });

  it('accepts Authorization Bearer as an alternate to query token', async () => {
    await boot();
    const token = await accessToken(['trade:write']);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}`, { Authorization: `Bearer ${token}` });
    await client.frameCount(3);
    expect(client.frames).toHaveLength(3);
    client.socket.close();
  });

  it('delivers orderUpdated and fillSettled over the socket to the owner only', async () => {
    await boot();
    const token = await accessToken(['trade:write']);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);

    hub.publish({
      orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      userId: USER,
      marketId: 'btc-usdt',
      status: 'open',
      side: 'buy',
      type: 'limit',
      qty: '1.5',
      filledQty: '0',
      price: '64000.5',
      clientOrderId: null,
      ts: '2026-07-31T00:00:00.000Z',
    });
    hub.publishFill({
      fillId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      userId: USER,
      marketId: 'btc-usdt',
      side: 'buy',
      liquidity: 'taker',
      price: '64000.5',
      qty: '0.25',
      quoteAmount: '16000.125',
      feeAsset: 'USDT',
      feeAmount: '16.000125',
      feeBps: 10,
      sequence: 42,
      ts: '2026-07-31T00:00:01.000Z',
    });
    // Foreign owner — must never land on this socket.
    hub.publish({
      orderId: '11111111-1111-4111-8111-111111111111',
      userId: OTHER,
      marketId: 'btc-usdt',
      status: 'open',
      side: 'sell',
      type: 'market',
      qty: '9',
      filledQty: '0',
      price: null,
      clientOrderId: null,
      ts: '2026-07-31T00:00:02.000Z',
    });

    await client.frameCount(5);
    const order = JSON.parse(client.frames[3]!);
    const fill = JSON.parse(client.frames[4]!);
    expect(order.channel).toBe('orders');
    expect(order.userId).toBe(USER);
    expect(typeof order.qty).toBe('string');
    expect(order.qty).toBe('1.5');
    expect(fill.channel).toBe('fills');
    expect(fill.userId).toBe(USER);
    expect(typeof fill.price).toBe('string');
    expect(client.frames).toHaveLength(5);
    client.socket.close();
  });

  it('sends position updates when published; silence when not (no invent)', async () => {
    await boot();
    const token = await accessToken(['trade:read']);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);
    await new Promise((r) => setTimeout(r, 40));
    expect(client.frames).toHaveLength(3);

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
    const token = await accessToken(['trade:write']);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);

    hub.publishPosition({
      positionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: OTHER,
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

    await new Promise((r) => setTimeout(r, 50));
    expect(client.frames).toHaveLength(3);
    client.socket.close();
  });

  it('ignores inbound client frames (push-only)', async () => {
    await boot();
    const token = await accessToken(['trade:read']);
    const client = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await client.frameCount(3);
    client.socket.send(JSON.stringify({ op: 'subscribe', channel: 'orders' }));
    client.socket.send('not-json');
    await new Promise((r) => setTimeout(r, 40));
    expect(client.frames).toHaveLength(3);
    expect(client.closed).toBeNull();
    client.socket.close();
  });

  it('reconnect does not replay past updates (no double-apply of history)', async () => {
    await boot();
    const token = await accessToken(['trade:read']);
    const first = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await first.frameCount(3);
    hub.publish({
      orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      userId: USER,
      marketId: 'btc-usdt',
      status: 'open',
      side: 'buy',
      type: 'limit',
      qty: '1',
      filledQty: '0',
      price: '100',
      clientOrderId: null,
      ts: '2026-07-31T00:00:00.000Z',
    });
    await first.frameCount(4);
    first.socket.close();
    await new Promise<void>((resolve) => first.socket.once('close', () => resolve()));

    const second = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await second.frameCount(3);
    await new Promise((r) => setTimeout(r, 40));
    // Ready only — historical order must not reappear.
    expect(second.frames).toHaveLength(3);
    for (const f of second.frames) {
      expect(JSON.parse(f).type).toBe('ready');
    }
    second.socket.close();
  });

  it('does not announce ready when hub is at capacity', async () => {
    await boot({ tokens, maxConnections: 1 });
    const token = await accessToken(['trade:read']);
    const holder = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await holder.frameCount(3);

    const blocked = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`);
    await blocked.openOrClose();
    // Capacity close is a WS close (1013), not ready frames then drop.
    expect(blocked.frames.filter((f) => JSON.parse(f).type === 'ready')).toHaveLength(0);
    holder.socket.close();
    if (!blocked.closed) blocked.socket.close();
  });

  it('terminates a private socket that never answers pong and frees the hub seat', async () => {
    // Real TCP + short heartbeat. autoPong:false is the ws@8 contract so a
    // dead peer cannot keep a hub seat forever (same as public /stream).
    await boot({ tokens, heartbeatMs: 50 });
    const token = await accessToken(['trade:read']);
    const dead = new WebSocket(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${token}`, {
      autoPong: false,
    });
    dead.on('error', () => undefined);

    let frames = 0;
    const gotReady = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('ready frames never arrived')), 3_000);
      dead.on('message', () => {
        frames++;
        if (frames >= 3) {
          clearTimeout(t);
          resolve();
        }
      });
    });
    const closed = new Promise<void>((resolve) => {
      dead.once('close', () => resolve());
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('private socket never opened')), 3_000);
      if (dead.readyState === WebSocket.OPEN) {
        clearTimeout(t);
        resolve();
        return;
      }
      dead.once('open', () => {
        clearTimeout(t);
        resolve();
      });
      dead.once('error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });
    await gotReady;
    expect(hub.connections).toBe(1);

    // Two heartbeat windows: first marks not-alive + ping; second terminates.
    // Give headroom for slow CI schedulers.
    await Promise.race([closed, new Promise<void>((r) => setTimeout(r, 2_000))]);
    expect(dead.readyState).toBe(WebSocket.CLOSED);
    const deadline = Date.now() + 2_000;
    while (hub.connections !== 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(hub.connections).toBe(0);
  }, 15_000);

  it('refuses a user past per-user cap while another user still connects', async () => {
    await boot({ tokens, maxConnections: 20, maxConnectionsPerUser: 2 });
    const tokenA = await accessToken(['trade:read'], tokens, USER);
    const tokenB = await accessToken(['trade:read'], tokens, OTHER);

    const a1 = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${tokenA}`);
    const a2 = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${tokenA}`);
    await a1.frameCount(3);
    await a2.frameCount(3);
    expect(hub.connections).toBe(2);

    const a3 = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${tokenA}`);
    await a3.openOrClose();
    // Hub closes then gateway terminates — code may be 1013 or abnormal 1006.
    if (!a3.closed) {
      await new Promise<void>((resolve) => {
        a3.socket.once('close', () => resolve());
        setTimeout(resolve, 1_000);
      });
    }
    expect(
      a3.frames.filter((f) => {
        try {
          return JSON.parse(f).type === 'ready';
        } catch {
          return false;
        }
      }),
    ).toHaveLength(0);
    expect(a3.closed).not.toBeNull();
    expect(hub.connections).toBe(2);

    const b1 = new Client(`${baseUrl}${PRIVATE_STREAM_PATH}?access_token=${tokenB}`);
    await b1.frameCount(3);
    expect(hub.connections).toBe(3);
    expect(b1.frames).toHaveLength(3);

    a1.socket.close();
    a2.socket.close();
    b1.socket.close();
    if (!a3.closed) a3.socket.close();
  });
});
