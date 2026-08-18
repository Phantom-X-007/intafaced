import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { HttpPrivateBookPort, openOrdersPath, openPositionsPath, parseOpenOrder, parseOpenPosition, PrivateBookError } from './book.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('private book parse', () => {
  it('maps CCXT open-order rows onto private delta shape with decimal strings', () => {
    const row = parseOpenOrder(
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        clientOrderId: 'cli-1',
        symbol: 'BTC/USDT',
        type: 'limit',
        side: 'buy',
        status: 'open',
        price: '64000.5',
        amount: '1.5',
        filled: '0',
        datetime: '2026-07-31T00:00:00.000Z',
      },
      USER,
    );
    expect(row.orderId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    expect(row.qty).toBe('1.5');
    expect(row.filledQty).toBe('0');
    expect(row.price).toBe('64000.5');
    expect(row.userId).toBe(USER);
  });

  it('refuses a JSON-number price (no fabricated mids)', () => {
    expect(() =>
      parseOpenOrder(
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          symbol: 'BTC/USDT',
          type: 'limit',
          side: 'buy',
          status: 'open',
          price: 64000.5,
          amount: '1',
          filled: '0',
        },
        USER,
      ),
    ).toThrow(PrivateBookError);
  });

  it('refuses a JSON-number mark on positions', () => {
    expect(() =>
      parseOpenPosition(
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          symbol: 'BTC/USDT:USDT',
          side: 'long',
          status: 'open',
          contracts: '1',
          entryPrice: '100',
          markPrice: 101,
          notional: '101',
        },
        USER,
      ),
    ).toThrow(PrivateBookError);
  });
});

describe('openOrdersPath', () => {
  it('omits the query when symbol is missing or empty', () => {
    expect(openOrdersPath()).toBe('/api/v1/orders/open');
    expect(openOrdersPath(undefined)).toBe('/api/v1/orders/open');
    expect(openOrdersPath('')).toBe('/api/v1/orders/open');
  });

  it('appends encodeURIComponent(symbol) when provided', () => {
    expect(openOrdersPath('BTC/USDT')).toBe(`/api/v1/orders/open?symbol=${encodeURIComponent('BTC/USDT')}`);
    expect(openOrdersPath('btc-usdt')).toBe('/api/v1/orders/open?symbol=btc-usdt');
  });
});

describe('openPositionsPath', () => {
  it('omits the query when symbol is missing or empty', () => {
    expect(openPositionsPath()).toBe('/api/v1/positions');
    expect(openPositionsPath(undefined)).toBe('/api/v1/positions');
    expect(openPositionsPath('')).toBe('/api/v1/positions');
  });

  it('appends encodeURIComponent(symbol) when provided', () => {
    expect(openPositionsPath('BTC/USDT:USDT')).toBe(`/api/v1/positions?symbol=${encodeURIComponent('BTC/USDT:USDT')}`);
    expect(openPositionsPath('btc-usdt')).toBe('/api/v1/positions?symbol=btc-usdt');
  });
});

describe('HttpPrivateBookPort', () => {
  it('forwards the access token to GET /api/v1/orders/open', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(`${req.method} ${req.url} ${req.headers.authorization ?? ''}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            symbol: 'btc-usdt',
            type: 'limit',
            side: 'buy',
            status: 'open',
            price: '100',
            amount: '1',
            filled: '0',
            datetime: '2026-07-31T00:00:00.000Z',
          },
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    const orders = await port.listOpenOrders({ accessToken: 'tok', userId: USER });
    expect(orders).toHaveLength(1);
    expect(orders[0]!.qty).toBe('1');
    expect(seen[0]).toBe('GET /api/v1/orders/open Bearer tok');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('treats empty symbol as the full open book (no query)', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    await expect(port.listOpenOrders({ accessToken: 'tok', userId: USER, symbol: '' })).resolves.toEqual([]);
    expect(seen[0]).toBe('/api/v1/orders/open');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('forwards a non-empty symbol as symbol= without post-filtering', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            symbol: 'BTC/USDT',
            type: 'limit',
            side: 'buy',
            status: 'open',
            price: '100',
            amount: '1',
            filled: '0',
            datetime: '2026-07-31T00:00:00.000Z',
          },
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    const orders = await port.listOpenOrders({ accessToken: 'tok', userId: USER, symbol: 'BTC/USDT' });
    expect(seen[0]).toBe(`/api/v1/orders/open?symbol=${encodeURIComponent('BTC/USDT')}`);
    expect(orders).toHaveLength(1);
    expect(orders[0]!.marketId).toBe('BTC/USDT');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('parses an empty page for an unknown symbol as []', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    await expect(port.listOpenOrders({ accessToken: 'tok', userId: USER, symbol: 'NOPE/USDT' })).resolves.toEqual([]);
    expect(seen[0]).toBe(`/api/v1/orders/open?symbol=${encodeURIComponent('NOPE/USDT')}`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns [] when trade REST is down — not a fabricated book', async () => {
    const port = new HttpPrivateBookPort({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 50 });
    await expect(port.listOpenOrders({ accessToken: 'tok', userId: USER })).resolves.toEqual([]);
  });

  it('returns [] when a row carries a numeric mid', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            symbol: 'btc-usdt',
            type: 'limit',
            side: 'buy',
            status: 'open',
            price: 64000.5,
            amount: '1',
            filled: '0',
          },
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    await expect(port.listOpenOrders({ accessToken: 'tok', userId: USER })).resolves.toEqual([]);
    await expect(port.listOpenOrders({ accessToken: 'tok', userId: USER, symbol: 'BTC/USDT' })).resolves.toEqual([]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('forwards the access token to GET /api/v1/positions', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(`${req.method} ${req.url} ${req.headers.authorization ?? ''}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            symbol: 'BTC/USDT:USDT',
            side: 'long',
            status: 'open',
            contracts: '1',
            entryPrice: '100',
            markPrice: '101',
            notional: '101',
            datetime: '2026-07-31T00:00:00.000Z',
          },
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    const positions = await port.listOpenPositions({ accessToken: 'tok', userId: USER });
    expect(positions).toHaveLength(1);
    expect(positions[0]!.contracts).toBe('1');
    expect(seen[0]).toBe('GET /api/v1/positions Bearer tok');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('treats empty symbol as the full open positions list (no query)', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    await expect(port.listOpenPositions({ accessToken: 'tok', userId: USER, symbol: '' })).resolves.toEqual([]);
    expect(seen[0]).toBe('/api/v1/positions');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('forwards a non-empty position symbol as symbol= without post-filtering', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            symbol: 'BTC/USDT:USDT',
            side: 'long',
            status: 'open',
            contracts: '1',
            entryPrice: '100',
            markPrice: '101',
            notional: '101',
            datetime: '2026-07-31T00:00:00.000Z',
          },
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    const positions = await port.listOpenPositions({
      accessToken: 'tok',
      userId: USER,
      symbol: 'BTC/USDT:USDT',
    });
    expect(seen[0]).toBe(`/api/v1/positions?symbol=${encodeURIComponent('BTC/USDT:USDT')}`);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.symbol).toBe('BTC/USDT:USDT');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('parses an empty positions page for an unknown symbol as []', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    await expect(port.listOpenPositions({ accessToken: 'tok', userId: USER, symbol: 'NOPE/USDT:USDT' })).resolves.toEqual([]);
    expect(seen[0]).toBe(`/api/v1/positions?symbol=${encodeURIComponent('NOPE/USDT:USDT')}`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns [] when a position row carries a numeric mark, including with a symbol query', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            symbol: 'BTC/USDT:USDT',
            side: 'long',
            status: 'open',
            contracts: '1',
            entryPrice: '100',
            markPrice: 101,
            notional: '101',
          },
        ]),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const port = new HttpPrivateBookPort({ baseUrl: `http://127.0.0.1:${addr.port}` });
    await expect(port.listOpenPositions({ accessToken: 'tok', userId: USER })).resolves.toEqual([]);
    await expect(port.listOpenPositions({ accessToken: 'tok', userId: USER, symbol: 'BTC/USDT:USDT' })).resolves.toEqual([]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
