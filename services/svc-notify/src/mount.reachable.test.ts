/**
 * Unit card — svc-notify is REACHABLE over HTTP, not merely constructible
 * 1. Promise: README "Edge path" — a client reaches these procedures at
 *    `GET /trpc/<procedure>` on this service. Doctrine: reachability gate
 * 2. Break: the tRPC plugin is registered at the wrong prefix, the context
 *    factory stops reading the edge headers, or a procedure exists on the router
 *    and is not served — every one of which `createCaller` is blind to
 * 3. Done bar: a real socket, a real request, a real 200/401 per procedure
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED: change the plugin prefix, or drop `createContext`
 * 7. Collision: none
 *
 * WHY THIS FILE EXISTS ALONGSIDE `router.mount.test.ts`.
 *
 * That file proves AUTHORISATION — self-only reads, forged principals refused —
 * and it does so through `createCaller`, which is the right tool for the job it
 * does. What it cannot see is whether anything serves the router: `createCaller`
 * invokes procedures in-process, so it is green on a service whose HTTP mount was
 * never registered, mounted at the wrong prefix, or wired to a context factory
 * that ignores the edge signature.
 *
 * That is not a hypothetical failure in this repository. svc-notify's own history
 * is a COMPLETE `bankMarginCalled` consumer that parked at every boot for weeks,
 * and D-S-13's second correction records a gate going green on two subscribers
 * that had never run. Both were caught by asking "is it mounted", not "does it
 * work". So this file asks over a socket.
 *
 * A real listener rather than `app.inject()`, for the same reason
 * `channels/gateway-wire.test.ts` runs a real `node:http` server: the recording
 * should be the request the operating system delivered.
 */

import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createNotifyRouter, type NotifyRouter } from './router.js';
import { NotifyService } from './notify-service.js';
import { MemoryNotifyStore } from './store.js';
import { MemoryDeliveryStore, MemoryTargetStore } from './channel-store.js';
import { channelsFromEnv } from './channels/registry.js';
import { NotificationDispatcher } from './dispatch.js';
import { AlertService } from './alerts/service.js';
import { MemoryAlertStore } from './alerts/store.js';
import type { MarkSource } from './alerts/types.js';

const SECRET = 'a-notify-reachability-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

/** The production default: no mark feed, so every evaluation refuses. */
const darkMarks: MarkSource = {
  kind: 'dark',
  async quote() {
    return { kind: 'unavailable', reason: 'dark', detail: 'no mark source configured' };
  },
};

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['notify:read', 'notify:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

/** The headers svc-edge puts on a forwarded request. */
function edgeHeaders(p: Principal = principal()): Record<string, string> {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

interface Mounted {
  readonly app: FastifyInstance;
  readonly base: string;
  readonly notifyStore: MemoryNotifyStore;
  readonly alerts: AlertService;
}

const running: FastifyInstance[] = [];

/**
 * The service's HTTP surface, assembled the way `index.ts` assembles it.
 *
 * Same plugin, same prefix, same context factory. Real services (memory-backed
 * stores), not stubs — a stub could satisfy a route that serves nothing useful.
 */
async function mount(): Promise<Mounted> {
  const notifyStore = new MemoryNotifyStore();
  const targets = new MemoryTargetStore();
  const deliveries = new MemoryDeliveryStore();
  // No gateway credentials — the state every deployment is in until an owner
  // provisions them. All three out-of-app channels register as unconfigured.
  const channels = channelsFromEnv({ NOTIFY_GATEWAY_TIMEOUT_MS: 5_000 });
  const dispatcher = new NotificationDispatcher(channels, targets, deliveries, { maxAttempts: 3, outOfAppEnabled: true });
  const notify = new NotifyService(notifyStore, { fanoutEnabled: true }, { targets, deliveries, channels, dispatcher });
  const alerts = new AlertService(new MemoryAlertStore(), darkMarks, notify);
  const appRouter = createNotifyRouter(notify, alerts);
  const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });

  const app = Fastify({ logger: false, maxParamLength: 5_000 });
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: ({ req }) => edgeContext({ headers: req.headers, id: req.id }),
    } satisfies FastifyTRPCPluginOptions<NotifyRouter>['trpcOptions'],
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  running.push(app);
  const { port } = app.server.address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}`, notifyStore, alerts };
}

afterEach(async () => {
  while (running.length > 0) await running.pop()!.close();
});

/** A tRPC single-call response, unwrapped. Throws nothing — the test asserts. */
async function call(
  base: string,
  procedure: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; input?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const method = init.method ?? 'GET';
  const url =
    method === 'GET' && init.input !== undefined
      ? `${base}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(init.input))}`
      : `${base}/trpc/${procedure}`;

  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...(method === 'POST' ? { body: JSON.stringify(init.input ?? {}) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
}

/** The `result.data` of a successful single call. */
function data(body: unknown): unknown {
  return (body as { result?: { data?: unknown } }).result?.data;
}

describe('svc-notify serves its router over a real socket', () => {
  it('answers health on the mounted prefix', async () => {
    const { base } = await mount();
    const res = await call(base, 'health');
    expect(res.status).toBe(200);
    expect(data(res.body)).toEqual({ ok: true, service: 'svc-notify', fanoutEnabled: true });
  });

  it('serves the inbox to an edge-signed caller', async () => {
    const { base } = await mount();
    const res = await call(base, 'notify.list', { headers: edgeHeaders() });
    expect(res.status).toBe(200);
    expect(data(res.body)).toEqual({ items: [], nextCursor: null });
  });

  it('refuses an unsigned caller at the HTTP boundary, not merely in the router', async () => {
    const { base } = await mount();
    const res = await call(base, 'notify.list');
    expect(res.status).toBe(401);
  });

  it('refuses a self-asserted principal that never passed through the edge', async () => {
    const { base } = await mount();
    const raw = encodePrincipal(principal());
    // The principal header without its signature — what a caller reaching this
    // port directly could forge.
    const res = await call(base, 'notify.list', { headers: { 'x-intafaced-principal': raw, 'x-intafaced-region': 'DE' } });
    expect(res.status).toBe(401);
  });

  /**
   * WHICH CHANNELS ACTUALLY DELIVER, asserted over the wire.
   *
   * One does. Three are wired to a transport and have no credentials, so they
   * refuse by name and say which variables an owner must set. That is the honest
   * state and this test pins it: a future edit that reports `available: true` for
   * a channel with no gateway would tell a user their margin call has a route it
   * does not have.
   */
  it('names in-app as the only channel that can deliver, and says what the other three need', async () => {
    const { base } = await mount();
    const res = await call(base, 'notify.channels', { headers: edgeHeaders() });
    expect(res.status).toBe(200);
    const channels = data(res.body) as readonly { channel: string; available: boolean; reason: string | null; requires: string[] }[];

    expect(channels.find((c) => c.channel === 'inapp')).toMatchObject({ available: true, reason: null, requires: [] });

    for (const channel of ['email', 'push', 'sms'] as const) {
      expect(channels.find((c) => c.channel === channel)).toMatchObject({
        available: false,
        reason: 'channel.not_configured',
        requires: [`NOTIFY_${channel.toUpperCase()}_GATEWAY_URL`, `NOTIFY_${channel.toUpperCase()}_GATEWAY_TOKEN`],
      });
    }
  });
});

describe('the alert surface tells the truth over the wire', () => {
  it('a watchlist read carries the fact that no watch on it can fire', async () => {
    const { base } = await mount();
    const res = await call(base, 'notify.alerts', { headers: edgeHeaders() });
    expect(res.status).toBe(200);
    expect(data(res.body)).toEqual({
      items: [],
      evaluation: { markSource: 'dark', canFire: false, code: 'alert.price_unavailable' },
    });
  });

  it('creating a watch returns the watch AND that it cannot cross yet — in one answer', async () => {
    const { base } = await mount();
    const res = await call(base, 'notify.createAlert', {
      method: 'POST',
      headers: edgeHeaders(),
      input: { marketId: 'BTC-USD', direction: 'above', targetPrice: '100' },
    });
    expect(res.status).toBe(200);
    const created = data(res.body) as { alert: { status: string; targetPrice: string }; evaluation: { canFire: boolean } };
    expect(created.alert.status).toBe('active');
    // Decimal string on the wire — never a JSON number.
    expect(created.alert.targetPrice).toBe('100');
    // The whole point: `active` never travels without this.
    expect(created.evaluation).toEqual({ markSource: 'dark', canFire: false, code: 'alert.price_unavailable' });
  });

  it('a watch created over HTTP is the one the sweep picks up', async () => {
    const { base, alerts, notifyStore } = await mount();
    await call(base, 'notify.createAlert', {
      method: 'POST',
      headers: edgeHeaders(),
      input: { marketId: 'BTC-USD', direction: 'above', targetPrice: '100' },
    });

    // The sweep that `index.ts` drives, run once by hand against the same
    // service instance the route wrote into. Dark source: refused, not fired,
    // and nothing lands in the inbox.
    const report = await alerts.evaluateDueAlerts();
    expect(report).toMatchObject({ markets: 1, fired: 0, refused: 1, refusals: { 'alert.price_unavailable': 1 } });
    expect(await notifyStore.unreadCount(USER)).toBe(0);

    const list = await call(base, 'notify.alerts', { headers: edgeHeaders() });
    const listed = data(list.body) as { items: readonly { status: string }[] };
    // Still active. A refused evaluation must never read as a fired watch.
    expect(listed.items[0]!.status).toBe('active');
  });
});
