import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdaptResult, MatchingOrderCommand } from './command.js';
import { matchingSubmitPath, postAdaptedNewOrder, postMatchingSubmit, toMatchingSubmitBody } from './matching-port.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const limitCmd: MatchingOrderCommand = {
  kind: 'new_order_single',
  clOrdId: 'clid-1',
  beginString: 'FIX.4.4',
  symbol: 'BTC/USDT',
  side: 'buy',
  ordType: 'limit',
  qty: '1.50',
  price: '100.25',
};

const marketCmd: MatchingOrderCommand = {
  ...limitCmd,
  clOrdId: 'clid-mkt',
  ordType: 'market',
  price: null,
};

type Recorded = {
  method: string;
  url: string;
  body: string;
};

const ack = {
  accepted: true,
  sequence: 1,
  fills: [] as const,
  resting: null,
  rejected: null,
  cancellations: [] as const,
  triggered: [] as const,
};

let server: Server | undefined;
const recorded: Recorded[] = [];

afterEach(async () => {
  recorded.length = 0;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): Promise<string> {
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function capture(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): Promise<void> {
  const text = await readBody(req);
  recorded.push({ method: req.method ?? '', url: req.url ?? '', body: text });
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('toMatchingSubmitBody — decimal strings, no last price', () => {
  it('maps qty and price as strings and type from ordType', () => {
    const body = toMatchingSubmitBody(limitCmd);
    expect(body).toEqual({
      clOrdId: 'clid-1',
      type: 'limit',
      side: 'buy',
      qty: '1.50',
      price: '100.25',
    });
    expect(typeof body.qty).toBe('string');
    expect(typeof body.price).toBe('string');
    expect(matchingSubmitPath(limitCmd)).toBe('/markets/BTC%2FUSDT/orders');
  });

  it('keeps market price null rather than inventing last', () => {
    const body = toMatchingSubmitBody(marketCmd);
    expect(body.price).toBeNull();
    expect(body).not.toHaveProperty('last');
    expect(body).not.toHaveProperty('lastPx');
    expect(body).not.toHaveProperty('lastPrice');
  });
});

describe('postAdaptedNewOrder — fake matching HTTP', () => {
  it('passes a 200 submit ack through without inventing fills', async () => {
    const url = await listen(async (req, res) => capture(req, res, 200, ack));
    const result = await postAdaptedNewOrder({ ok: true, command: limitCmd }, { matchingBaseUrl: url });
    expect(result).toEqual({ ok: true, ack });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.method).toBe('POST');
    expect(recorded[0]?.url).toBe('/markets/BTC%2FUSDT/orders');
    const posted = JSON.parse(recorded[0]?.body ?? '{}') as Record<string, unknown>;
    expect(posted.qty).toBe('1.50');
    expect(posted.price).toBe('100.25');
    expect(typeof posted.qty).toBe('string');
    expect(typeof posted.price).toBe('string');
    expect(posted).not.toHaveProperty('lastPrice');
    expect(result.ok && result.ack.fills).toEqual([]);
  });

  it('names 503 matching_unavailable and does not invent a fill', async () => {
    const url = await listen(async (req, res) => capture(req, res, 503, { error: 'down' }));
    const result = await postMatchingSubmit(limitCmd, { matchingBaseUrl: url });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('matching_unavailable');
    expect(result.error.message.toLowerCase()).toContain('invent');
    expect(recorded).toHaveLength(1);
  });

  it('names timeout matching_timeout when matching never answers', async () => {
    const url = await listen(() => undefined);
    const result = await postMatchingSubmit(limitCmd, { matchingBaseUrl: url, timeoutMs: 40 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('matching_timeout');
    expect(recorded).toHaveLength(0);
  });

  it('names 400 matching_rejected', async () => {
    const url = await listen(async (req, res) => capture(req, res, 400, { code: 'BadRequest', issues: ['accountId'] }));
    const result = await postMatchingSubmit(limitCmd, { matchingBaseUrl: url });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('matching_rejected');
  });

  it('blank MATCHING_BASE_URL refuses matching_unconfigured without inventing localhost', async () => {
    const prev = process.env.MATCHING_BASE_URL;
    delete process.env.MATCHING_BASE_URL;
    try {
      const result = await postMatchingSubmit(limitCmd, { matchingBaseUrl: '' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('matching_unconfigured');
      expect(result.error.message).not.toMatch(/localhost/i);
      expect(recorded).toHaveLength(0);
    } finally {
      if (prev === undefined) delete process.env.MATCHING_BASE_URL;
      else process.env.MATCHING_BASE_URL = prev;
    }
  });

  it('unsupported BeginString refuses before HTTP', async () => {
    const url = await listen(async (req, res) => capture(req, res, 200, ack));
    const adapted: AdaptResult = {
      ok: false,
      error: { code: 'unsupported_begin_string', message: 'BeginString FIX.4.0 is not FIX.4.2, FIX.4.4, FIX.5.0, or FIXT.1.1' },
    };
    const result = await postAdaptedNewOrder(adapted, { matchingBaseUrl: url });
    expect(result).toEqual(adapted);
    expect(recorded).toHaveLength(0);
  });

  it('unsupported beginString on the command refuses before HTTP', async () => {
    const url = await listen(async (req, res) => capture(req, res, 200, ack));
    const result = await postMatchingSubmit({ ...limitCmd, beginString: 'FIX.4.0' }, { matchingBaseUrl: url });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unsupported_begin_string');
    expect(recorded).toHaveLength(0);
  });

  it('market order posts price null and never a last price', async () => {
    const url = await listen(async (req, res) => capture(req, res, 200, ack));
    const result = await postMatchingSubmit(marketCmd, { matchingBaseUrl: url });
    expect(result.ok).toBe(true);
    const posted = JSON.parse(recorded[0]?.body ?? '{}') as Record<string, unknown>;
    expect(posted.price).toBeNull();
    expect(posted).not.toHaveProperty('last');
    expect(posted).not.toHaveProperty('lastPx');
    expect(JSON.stringify(posted)).not.toMatch(/lastPrice/);
  });

  it('never posts ledger and does not depend on ledger-client', async () => {
    const url = await listen(async (req, res) => capture(req, res, 200, ack));
    await postMatchingSubmit(limitCmd, { matchingBaseUrl: url });
    expect(recorded.every((r) => !r.url.includes('ledger'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(names).not.toContain('@intafaced/ledger-client');
    const port = readFileSync(join(root, 'src/matching-port.ts'), 'utf8');
    expect(port).not.toMatch(/ledger-client/);
    expect(port).not.toMatch(/ledger\.post/);
    expect(port).not.toMatch(/\blastPrice\b/);
  });
});
