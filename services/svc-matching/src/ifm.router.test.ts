/**
 * H8e HTTP door: crash after in_flight journal, before apply → in_flight_unknown.
 * No second rest. No duplicate fill. Replay must not invent a cancel.
 * Qty/price on the wire are decimal strings.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { FileJournal, replay, type EngineJournal, type JournalCommand, type JournalRecord } from './engine/journal.js';
import { IN_FLIGHT_UNKNOWN, persistInFlight } from './engine/ifm.js';
import { installIfmCrash } from './engine/ifm-crash.js';
import { registerRoutes } from './router.js';

installIfmCrash();

const SECRET = 'matching-h8e-ifm-http-router-secret-32';
const MARKET = 'BTC-USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const ASK = '33333333-3333-4333-8333-333333333333';
const TAKE = '22222222-2222-4222-8222-222222222222';

class CrashAfterInFlight implements EngineJournal {
  constructor(
    private readonly inner: FileJournal,
    private readonly boomOn: 'amend' | 'cancel',
  ) {}

  append(command: JournalCommand): JournalRecord {
    if (command.kind === this.boomOn) throw new Error('crash after in_flight, before apply');
    return this.inner.append(command);
  }

  read(): readonly JournalRecord[] {
    return this.inner.read();
  }

  get length(): number {
    return this.inner.length;
  }

  close(): void {
    this.inner.close();
  }
}

function proofFor(action: 'PLACE' | 'AMEND' = 'PLACE') {
  const observedAt = '2026-09-03T16:00:00.000Z';
  return createMarketLifecycleAdmissionProof(
    {
      marketId: MARKET,
      ruleVersion: 'test.rules.v1',
      instrumentId: MARKET,
      instrumentVersion: 'test.instrument.v1',
      state: 'OPEN',
      reasonCategory: 'NORMAL',
      reasonCode: 'trade.lifecycle.ready',
      effectiveAt: observedAt,
      observedAt,
      lastGoodState: 'OPEN',
      allowedActions: ['PLACE', 'PLACE_POST_ONLY', 'AMEND'],
      transitionId: 'test.transition',
      evidenceRefs: ['test.evidence'],
    },
    action,
  );
}

function submitBody(over: Record<string, unknown> = {}) {
  return {
    orderId: REST,
    accountId: 'desk',
    type: 'limit' as const,
    side: 'sell' as const,
    qty: '1.5',
    price: '100',
    tif: 'GTC' as const,
    lifecycleProof: proofFor('PLACE'),
    ...over,
  };
}

function tmpJournal(): string {
  return join(mkdtempSync(join(tmpdir(), 'matching-h8e-ifm-http-')), 'engine.ndjson');
}

async function mount(journal: EngineJournal): Promise<{ app: FastifyInstance; engine: MatchingEngine; journal: EngineJournal }> {
  const engine = new MatchingEngine({ journal, bus: new MemoryEventBus('svc-matching'), snapshotEvery: 0 });
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return { app, engine, journal };
}

function post(app: FastifyInstance, url: string, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

function patch(app: FastifyInstance, url: string, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'PATCH',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

function del(app: FastifyInstance, url: string) {
  return app.inject({
    method: 'DELETE',
    url,
    headers: { ...serviceAuthHeadersForBody('svc-trade', SECRET, '') },
  });
}

function getOrders(app: FastifyInstance) {
  return app.inject({
    method: 'GET',
    url: `/markets/${MARKET}/orders`,
    headers: { ...serviceAuthHeadersForBody('svc-trade', SECRET, '') },
  });
}

async function crashHttp(run: () => Promise<{ statusCode: number }>): Promise<void> {
  try {
    const res = await run();
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('crash after in_flight');
  }
}

function diskRows(
  path: string,
): Array<{ kind: string; inFlight?: boolean; qty?: string | null; order?: { qty?: string; price?: string } }> {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { kind: string; inFlight?: boolean; qty?: string | null; order?: { qty?: string; price?: string } });
}

describe('H8e HTTP IFM crash window — in_flight_unknown, no second rest', () => {
  it('HTTP cancel crash after in_flight journal refuses further mutation and does not invent a cancel', async () => {
    const path = tmpJournal();
    const liveJournal = new FileJournal(path);
    const { app: liveApp } = await mount(new CrashAfterInFlight(liveJournal, 'cancel'));

    const placed = await post(liveApp, `/markets/${MARKET}/orders`, submitBody());
    expect(placed.statusCode).toBe(200);
    expect(placed.json().accepted).toBe(true);
    expect(placed.json().resting.remaining).toBe('1.5');
    expect(typeof placed.json().resting.remaining).toBe('string');
    expect(typeof placed.json().resting.price).toBe('string');

    await crashHttp(() => del(liveApp, `/markets/${MARKET}/orders/${REST}`));
    await liveApp.close();
    liveJournal.close();

    const recoveredJournal = new FileJournal(path);
    const recovered = new MatchingEngine({
      journal: recoveredJournal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    const lengthBefore = recoveredJournal.length;
    recovered.recover();
    expect(recoveredJournal.length).toBe(lengthBefore);
    expect(recoveredJournal.read().some((record) => record.kind === 'cancel')).toBe(false);

    const app = Fastify({ logger: false });
    registerRoutes(app, recovered, SECRET, { bodyBind: 'require' });
    await app.ready();

    const cancelled = await del(app, `/markets/${MARKET}/orders/${REST}`);
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      cancelled: false,
      orderId: REST,
      cancellation: null,
      rejected: { code: IN_FLIGHT_UNKNOWN },
    });

    const amended = await patch(app, `/markets/${MARKET}/orders/${REST}`, {
      expectedVersion: 1,
      qty: '1',
      lifecycleProof: proofFor('AMEND'),
    });
    expect(amended.statusCode).toBe(200);
    expect(amended.json().accepted).toBe(false);
    expect(amended.json().rejected.code).toBe(IN_FLIGHT_UNKNOWN);
    expect(amended.json().fills).toEqual([]);
    expect(amended.json().resting).toBeNull();

    const second = await post(app, `/markets/${MARKET}/orders`, submitBody({ accountId: 'other', qty: '9', price: '50' }));
    expect(second.statusCode).toBe(200);
    expect(second.json().accepted).toBe(false);
    expect(second.json().rejected.code).toBe(IN_FLIGHT_UNKNOWN);
    expect(second.json().fills).toEqual([]);
    expect(second.json().resting).toBeNull();

    const listed = await getOrders(app);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().orders).toHaveLength(1);
    expect(listed.json().orders[0]).toMatchObject({ orderId: REST, remaining: '1.5', price: '100' });
    expect(typeof listed.json().orders[0].remaining).toBe('string');
    expect(typeof listed.json().orders[0].price).toBe('string');

    const onDisk = diskRows(path);
    expect(onDisk.map((row) => row.kind)).toEqual(['submit', 'in_flight']);
    expect(onDisk[0]!.order?.qty).toBe('1.5');
    expect(onDisk[1]!.inFlight).toBe(true);
    expect(onDisk[1]!.qty).toBe('1.5');
    expect(persistInFlight(onDisk[1]!)).toBe(true);

    const books = replay(recoveredJournal.read());
    expect(
      books
        .get(MARKET)
        ?.toState()
        .asks[0]!.orders.map((o) => o.orderId),
    ).toEqual([REST]);
    expect(books.get(MARKET)?.toState().asks[0]!.orders).toHaveLength(1);

    await app.close();
    recoveredJournal.close();
  });

  it('HTTP amend crash window does not emit a duplicate fill', async () => {
    const path = tmpJournal();
    const liveJournal = new FileJournal(path);
    const { app: liveApp } = await mount(new CrashAfterInFlight(liveJournal, 'amend'));

    expect(
      (await post(liveApp, `/markets/${MARKET}/orders`, submitBody({ orderId: ASK, accountId: 'mm', qty: '1', price: '100' }))).statusCode,
    ).toBe(200);
    expect(
      (
        await post(
          liveApp,
          `/markets/${MARKET}/orders`,
          submitBody({ orderId: REST, accountId: 'desk', side: 'buy', qty: '1.5', price: '90' }),
        )
      ).statusCode,
    ).toBe(200);

    await crashHttp(() =>
      patch(liveApp, `/markets/${MARKET}/orders/${REST}`, {
        expectedVersion: 1,
        price: '100',
        lifecycleProof: proofFor('AMEND'),
      }),
    );
    await liveApp.close();
    liveJournal.close();

    const recoveredJournal = new FileJournal(path);
    const recovered = new MatchingEngine({
      journal: recoveredJournal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();
    expect(recoveredJournal.read().some((record) => record.kind === 'amend')).toBe(false);
    expect(recoveredJournal.read().some((record) => record.kind === 'cancel')).toBe(false);

    const app = Fastify({ logger: false });
    registerRoutes(app, recovered, SECRET, { bodyBind: 'require' });
    await app.ready();

    const secondAmend = await patch(app, `/markets/${MARKET}/orders/${REST}`, {
      expectedVersion: 1,
      price: '100',
      lifecycleProof: proofFor('AMEND'),
    });
    expect(secondAmend.statusCode).toBe(200);
    expect(secondAmend.json().accepted).toBe(false);
    expect(secondAmend.json().rejected.code).toBe(IN_FLIGHT_UNKNOWN);
    expect(secondAmend.json().fills).toEqual([]);

    const take = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({ orderId: TAKE, accountId: 'taker', side: 'buy', qty: '1', price: '100' }),
    );
    expect(take.statusCode).toBe(200);
    expect(take.json().accepted).toBe(true);
    expect(take.json().fills).toHaveLength(1);
    expect(take.json().fills[0]).toMatchObject({
      makerOrderId: ASK,
      takerOrderId: TAKE,
      qty: '1',
      price: '100',
    });
    expect(typeof take.json().fills[0].qty).toBe('string');
    expect(typeof take.json().fills[0].price).toBe('string');

    const listed = await getOrders(app);
    expect(listed.statusCode).toBe(200);
    expect(
      listed
        .json()
        .orders.map((row: { orderId: string }) => row.orderId)
        .sort(),
    ).toEqual([REST]);
    expect(listed.json().orders[0]).toMatchObject({ orderId: REST, remaining: '1.5', price: '90' });
    expect(typeof listed.json().orders[0].remaining).toBe('string');

    const onDisk = diskRows(path);
    expect(onDisk.some((row) => row.kind === 'in_flight' && row.inFlight === true && row.qty === '1.5')).toBe(true);
    expect(onDisk.some((row) => row.kind === 'amend')).toBe(false);
    expect(onDisk.some((row) => row.kind === 'cancel')).toBe(false);

    await app.close();
    recoveredJournal.close();
  });
});
