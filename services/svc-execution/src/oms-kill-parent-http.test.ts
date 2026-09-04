import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { handleKillParentDoor, registerKillParentDoor } from './oms-kill-parent-http.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { createExecutionRouter } from './router.js';

const OP = '33333333-3333-4333-8333-333333333333';
const SECRET = 'a-execution-oms-kill-parent-http-test-edge-secret';
const CHILD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORIGINATOR = '55555555-5555-4555-8555-555555555555';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

function retainedTwap(): RetainedAlgoSchedule {
  return { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null };
}

function liveParent(): ApprovedAlgoParent {
  return {
    parentClientOrderId: 'parent-twap',
    kind: 'twap',
    status: 'running',
    startedAt: '2026-08-25T00:00:00.000Z',
    residual: { remaining: '10' },
    originator: ORIGINATOR,
    schedule: retainedTwap(),
  };
}

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signedHeaders(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return {
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
    'x-intafaced-region': 'DE',
  };
}

let server: Server | undefined;

afterEach(async () => {
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

describe('handleKillParentDoor', () => {
  it('matching never saw parent → killed false, parent stays running', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(liveParent());
    const matchingUrl = await listen((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ cancelled: false }));
    });
    const out = await handleKillParentDoor(
      {
        parentClientOrderId: 'parent-twap',
        children: [{ marketId: 'BTC-USDT', orderId: CHILD }],
      },
      OP,
      {
        parentStore,
        pauseStore: new InMemoryAlgoPauseStore(),
        emsStore: new InMemoryEmsOrderStore(),
        matchingUrl,
      },
    );
    expect(out).toMatchObject({ ok: true, killed: false });
    if (!out.ok) return;
    expect('killed' in out && out.killed).toBe(false);
    expect(parentStore.get('parent-twap')?.status).toBe('running');
  });

  it('paper flag refuses before matching — no ledger', async () => {
    const out = await handleKillParentDoor(
      { parentClientOrderId: 'parent-twap', paper: true, children: [{ marketId: 'BTC-USDT', orderId: CHILD }] },
      OP,
      { matchingUrl: 'http://matching.example' },
    );
    expect(out).toMatchObject({ ok: false, reason: 'paper_unsupported' });
  });
});

describe('POST /execution/oms/kill-parent', () => {
  it('refuses anonymous kill-parent', async () => {
    const f = Fastify();
    registerKillParentDoor(f, { edgeContext });
    await f.ready();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/kill-parent',
      payload: { parentClientOrderId: 'parent-twap' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    await f.close();
  });

  it('signed kill-parent matching 404 is killed false', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(liveParent());
    const matchingUrl = await listen((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ cancelled: false }));
    });
    const f = Fastify();
    registerKillParentDoor(f, {
      edgeContext,
      parentStore,
      pauseStore: new InMemoryAlgoPauseStore(),
      emsStore: new InMemoryEmsOrderStore(),
      matchingUrl,
    });
    await f.ready();
    const res = await f.inject({
      method: 'POST',
      url: '/execution/oms/kill-parent',
      headers: signedHeaders(),
      payload: {
        parentClientOrderId: 'parent-twap',
        children: [{ marketId: 'BTC-USDT', orderId: CHILD }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, killed: false });
    expect(parentStore.get('parent-twap')?.status).toBe('running');
    await f.close();
  });
});

function killParentCaller(parentStore: InMemoryApprovedAlgoParentStore, matchingUrl?: string) {
  return createExecutionRouter(
    new SealedHouseTenantRegistry(),
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    new InMemoryEmsOrderStore(),
    undefined,
    new InMemoryAlgoPauseStore(),
    parentStore,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    matchingUrl,
  ).createCaller(
    edgeContext({
      headers: signedHeaders(),
      id: 'req-trpc-kill-parent',
    }),
  );
}

describe('tRPC execution.oms.killParent', () => {
  it('same handleKillParentDoor as HTTP — matching never saw is not killed', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(liveParent());
    const matchingUrl = await listen((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ cancelled: false }));
    });
    const out = await killParentCaller(parentStore, matchingUrl).execution.oms.killParent({
      parentClientOrderId: 'parent-twap',
      children: [{ marketId: 'BTC-USDT', orderId: CHILD }],
    });
    expect(out).toMatchObject({ ok: true, killed: false });
    expect(parentStore.get('parent-twap')?.status).toBe('running');
  });

  it('unknown parent in store is named not_found — not killed', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const out = await killParentCaller(parentStore).execution.oms.killParent({
      parentClientOrderId: 'never-saw',
    });
    expect(out).toMatchObject({ ok: false, reason: 'not_found' });
    expect(out).not.toMatchObject({ killed: true });
  });
});
