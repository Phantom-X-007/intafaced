import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCors, type OriginAllowlist } from './cors.js';

/**
 * THE ONLY LAYER THAT ACTUALLY ENFORCES ANY OF THIS.
 *
 * ── Why this file exists on top of `cors.test.ts` ───────────────────────────
 *
 * Nothing on the server enforces CORS. The server states a policy in headers and
 * a BROWSER decides what to do about it — which means a test suite that only
 * asserts on header strings is asserting that we wrote down the right sentence,
 * not that anything obeys it. Those are different claims, and an audit in this
 * repo has already found the gap between them: a test that intercepted nothing
 * because it mocked the wrong layer, and passed for exactly that reason.
 *
 * So this file drives real Chromium against a real socket. No `inject`, no
 * mocked fetch, no stubbed transport. A page is served from one origin, it calls
 * an edge on another, and the assertion is about what the browser did.
 *
 * ── The assertion that carries the most weight ──────────────────────────────
 *
 * `the edge never sees the POST` (below). A refused preflight is only a control
 * if the browser then declines to SEND the request — and that is a property of
 * Chromium, not of us. Asserting it against the edge's own record of what
 * arrived is the difference between "we returned 403 to an OPTIONS" and "the
 * mutation did not happen".
 *
 * Its sibling guard matters just as much: on the READ path we assert the edge
 * DID receive the request while the browser still refused to hand the body to
 * JavaScript. Without that, a `fetch` rejection could equally mean the port was
 * shut, the DNS failed, or the test was pointed at nothing — the exact shape of
 * a test that proves nothing while looking green.
 *
 * ── Ports ───────────────────────────────────────────────────────────────────
 *
 * Every server binds `127.0.0.1:0` and the allowlist is built from the port the
 * OS actually handed out. Nothing here depends on `DEV_ORIGINS` or on :3000
 * being free, so this suite cannot pass or fail because of what else is running
 * on the machine.
 */

/**
 * Chromium ships with `@playwright/test` at the workspace root but is a separate
 * download. When it is absent this suite skips rather than fails — but it says so
 * out loud, because a browser proof that quietly stopped running is worth less
 * than no browser proof at all. `pnpm exec playwright install chromium` restores it.
 */
async function chromiumOrNull() {
  try {
    const { chromium } = await import('@playwright/test');
    return existsSync(chromium.executablePath()) ? chromium : null;
  } catch {
    return null;
  }
}

const chromium = await chromiumOrNull();
if (!chromium) {
  console.warn('\n  ⚠ svc-edge CORS browser proof SKIPPED — no Chromium binary.\n    pnpm exec playwright install chromium\n');
}

const PAGE = '<!doctype html><meta charset="utf-8"><title>cors probe</title><body>probe</body>';

/** A bare origin to load a page from. Serves one HTML document and nothing else. */
async function pageServer(): Promise<{ origin: string; server: Server }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}

interface Edge {
  app: FastifyInstance;
  origin: string;
  /** Every request that reached a HANDLER. A preflight never appears here. */
  reached: string[];
  /** Every request that reached the SERVER, hooks included. Preflights do appear. */
  arrived: string[];
}

async function edgeServer(origins: readonly string[]): Promise<Edge> {
  const app = Fastify({ logger: false });
  const reached: string[] = [];
  const arrived: string[] = [];

  const allowlist: OriginAllowlist = { origins, configured: true, source: 'browser-e2e', summary: '' };

  // Recorded BEFORE the CORS hook, so `arrived` is the honest answer to "did
  // Chromium put this on the wire at all" — which is the whole question on the
  // refused-preflight path.
  app.addHook('onRequest', async (req) => {
    arrived.push(`${req.method} ${req.url}`);
  });
  registerCors(app, allowlist);

  app.get('/api/v1/markets', async (req) => {
    reached.push(`${req.method} ${req.url}`);
    return { markets: ['BTC/USDT'] };
  });

  // Stands in for a mutation. If a browser ever reaches this from a refused
  // origin, the preflight was decoration.
  app.post('/api/trade/trpc/orders.create', async (req) => {
    reached.push(`${req.method} ${req.url}`);
    return { result: { data: { orderId: 'must-never-be-reached-cross-origin' } } };
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  return { app, origin: `http://127.0.0.1:${port}`, reached, arrived };
}

/** What a page saw. `blocked` is the browser refusing, not the server. */
interface ProbeResult {
  blocked: boolean;
  status?: number;
  body?: string;
  error?: string;
}

describe.skipIf(!chromium)('CORS, enforced by a real browser', () => {
  let browser: Awaited<ReturnType<NonNullable<typeof chromium>['launch']>>;
  let allowed: { origin: string; server: Server };
  let refused: { origin: string; server: Server };
  let edge: Edge;

  beforeAll(async () => {
    allowed = await pageServer();
    refused = await pageServer();
    // The allowlist holds exactly one of the two page origins. Both are
    // `127.0.0.1` on different ports — which are DIFFERENT ORIGINS to a browser,
    // and that is the whole reason apps/web on :3000 could never reach the edge
    // on :4000.
    edge = await edgeServer([allowed.origin]);
    browser = await chromium!.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await edge?.app.close();
    await new Promise<void>((r) => allowed?.server.close(() => r()));
    await new Promise<void>((r) => refused?.server.close(() => r()));
  });

  /** Load a page at `pageOrigin` and run `fetch` from inside it. */
  async function probe(pageOrigin: string, path: string, init?: { method?: string; auth?: boolean }): Promise<ProbeResult> {
    const page = await browser.newPage();
    try {
      await page.goto(pageOrigin, { waitUntil: 'domcontentloaded' });
      return await page.evaluate(
        async ([url, method, auth]) => {
          try {
            const res = await fetch(url as string, {
              method: (method as string) ?? 'GET',
              // `Authorization` is not CORS-safelisted and `application/json` is
              // not a safelisted content-type, so this pair is exactly what makes
              // every tRPC call in apps/web preflight.
              headers: auth ? { authorization: 'Bearer probe-token', 'content-type': 'application/json' } : {},
              ...(method === 'POST' ? { body: '{}' } : {}),
            });
            return { blocked: false, status: res.status, body: await res.text() };
          } catch (err) {
            // A CORS failure surfaces to script as an opaque TypeError. That
            // opacity is the point: the page is told nothing about the response.
            return { blocked: true, error: String(err) };
          }
        },
        [`${edge.origin}${path}`, init?.method ?? 'GET', init?.auth ?? false] as const,
      );
    } finally {
      await page.close();
    }
  }

  it('an ALLOWED origin can read the answer', async () => {
    const before = edge.reached.length;
    const result = await probe(allowed.origin, '/api/v1/markets');

    expect(result.blocked).toBe(false);
    expect(result.status).toBe(200);
    expect(result.body).toContain('BTC/USDT');
    expect(edge.reached.length).toBe(before + 1);
  }, 60_000);

  it('a DISALLOWED origin is blocked BY THE BROWSER — and the edge still answered', async () => {
    const before = edge.reached.length;
    const result = await probe(refused.origin, '/api/v1/markets');

    expect(result.blocked).toBe(true);
    // The guard against a test that proves nothing: the request really was sent
    // and really was served. The rejection above is Chromium withholding a
    // successful response for want of `Access-Control-Allow-Origin` — not a
    // connection that never happened.
    expect(edge.reached.length).toBe(before + 1);
  }, 60_000);

  it('an ALLOWED origin completes the full preflight → POST round trip', async () => {
    const before = edge.arrived.length;
    const result = await probe(allowed.origin, '/api/trade/trpc/orders.create', { method: 'POST', auth: true });

    expect(result.blocked).toBe(false);
    expect(result.status).toBe(200);

    const traffic = edge.arrived.slice(before);
    // Chromium sent the preflight itself; nothing in this test asked for it.
    expect(traffic).toContain('OPTIONS /api/trade/trpc/orders.create');
    expect(traffic).toContain('POST /api/trade/trpc/orders.create');
  }, 60_000);

  it('a DISALLOWED origin never gets to send the POST at all', async () => {
    // THE ASSERTION THIS FILE EXISTS FOR. A refused preflight is only a control
    // if the mutation is never put on the wire, and that is Chromium's decision.
    const before = edge.arrived.length;
    const reachedBefore = edge.reached.length;

    const result = await probe(refused.origin, '/api/trade/trpc/orders.create', { method: 'POST', auth: true });

    expect(result.blocked).toBe(true);

    const traffic = edge.arrived.slice(before);
    expect(traffic).toContain('OPTIONS /api/trade/trpc/orders.create');
    expect(traffic).not.toContain('POST /api/trade/trpc/orders.create');
    // Nothing behind the CORS layer was touched. No handler ran.
    expect(edge.reached.length).toBe(reachedBefore);
  }, 60_000);

  it('a same-origin call is untouched — the vendored shell`s path through nginx', async () => {
    // A page served BY the edge itself sends no `Origin`, so none of this layer
    // applies to it. This is the `:8090` shell, whose `/api` is proxied
    // same-origin and which has always reached the edge fine.
    const page = await browser.newPage();
    try {
      await page.goto(`${edge.origin}/api/v1/markets`, { waitUntil: 'domcontentloaded' });
      const result = await page.evaluate(async () => {
        const res = await fetch('/api/v1/markets');
        return { status: res.status, body: await res.text() };
      });
      expect(result.status).toBe(200);
      expect(result.body).toContain('BTC/USDT');
    } finally {
      await page.close();
    }
  }, 60_000);
});
