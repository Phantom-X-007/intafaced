import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { cancelKillParentMatching } from './oms-kill-parent-matching.js';
import { killLiveAlgoParent } from './oms-kill-parent.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { InMemoryAlgoPauseStore } from './oms-pause.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';

const CHILD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORIGINATOR = '55555555-5555-4555-8555-555555555555';
const OP = '33333333-3333-4333-8333-333333333333';

type Recorded = { method: string; url: string };
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

async function capture(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): Promise<void> {
  recorded.push({ method: req.method ?? '', url: req.url ?? '' });
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

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

describe('cancelKillParentMatching — unknown ≠ killed', () => {
  it('matching 404 (never saw) is unknown — not killed from silence', async () => {
    const matchingUrl = await listen(async (req, res) => {
      await capture(req, res, 404, { cancelled: false });
    });
    const out = await cancelKillParentMatching({
      matchingUrl,
      children: [{ marketId: 'BTC-USDT', orderId: CHILD }],
    });
    expect(out).toMatchObject({ ok: true, killed: false });
    if (!out.ok) return;
    expect(out.children[0]).toMatchObject({ outcome: 'unknown', reason: 'matching_unknown' });
    expect(recorded).toEqual([{ method: 'DELETE', url: `/markets/BTC-USDT/orders/${CHILD}` }]);
  });

  it('cancelled true without sequence is unknown — cancel is a request until matching sequence', async () => {
    const matchingUrl = await listen(async (req, res) => {
      await capture(req, res, 200, { cancelled: true, orderId: CHILD });
    });
    const out = await cancelKillParentMatching({
      matchingUrl,
      children: [{ marketId: 'BTC-USDT', orderId: CHILD }],
    });
    expect(out).toMatchObject({ ok: true, killed: false });
    if (!out.ok) return;
    expect(out.children[0]).toMatchObject({ outcome: 'unknown', reason: 'matching_unknown' });
  });

  it('cancelled true with sequence is killed true', async () => {
    const matchingUrl = await listen(async (req, res) => {
      await capture(req, res, 200, { cancelled: true, sequence: 9, orderId: CHILD });
    });
    const out = await cancelKillParentMatching({
      matchingUrl,
      children: [{ marketId: 'BTC-USDT', orderId: CHILD }],
    });
    expect(out).toEqual({
      ok: true,
      killed: true,
      children: [{ clientOrderId: CHILD, venueId: 'BTC-USDT', outcome: 'stopped', status: 'canceled' }],
    });
  });
});

describe('killLiveAlgoParent matching never-saw', () => {
  it('parent matching never saw → killed false, parent stays running', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(liveParent());
    const matchingUrl = await listen(async (req, res) => {
      await capture(req, res, 404, { cancelled: false });
    });
    const out = await killLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      parentStore,
      pauseStore: new InMemoryAlgoPauseStore(),
      emsStore: new InMemoryEmsOrderStore(),
      matchingUrl,
      matchingChildren: [{ marketId: 'BTC-USDT', orderId: CHILD }],
    });
    expect(out).toMatchObject({ ok: true, killed: false });
    if (!out.ok) return;
    expect(out.children[0]).toMatchObject({ outcome: 'unknown', reason: 'matching_unknown' });
    expect(parentStore.get('parent-twap')?.status).toBe('running');
  });

  it('matching sequence stops the parent', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(liveParent());
    const matchingUrl = await listen(async (req, res) => {
      await capture(req, res, 200, { cancelled: true, sequence: 4, orderId: CHILD });
    });
    const out = await killLiveAlgoParent({
      parentClientOrderId: 'parent-twap',
      operatorId: OP,
      parentStore,
      pauseStore: new InMemoryAlgoPauseStore(),
      emsStore: new InMemoryEmsOrderStore(),
      matchingUrl,
      matchingChildren: [{ marketId: 'BTC-USDT', orderId: CHILD }],
    });
    expect(out).toMatchObject({ ok: true, killed: true });
    expect(parentStore.get('parent-twap')?.status).toBe('stopped');
  });
});
