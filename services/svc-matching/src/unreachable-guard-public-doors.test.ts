/**
 * Unit card (D26-P2-03):
 * Promise: every money-affecting matching guard is reachable through mounted
 *   Fastify public doors — not engine/book unit-only (the unreachable-guard
 *   failure mode: correct in isolation, never exercised on the wire).
 * Break: STP / maker-price / IOC remainder / post-only / duplicate-id /
 *   kill-switch / reconcile quantity disagreement / depth decimal honesty
 *   could hold in book.test / engine.test / reconcile.test and still regress
 *   on the HTTP door svc-trade actually calls.
 * Done bar (all via signed HTTP + real MatchingEngine unless noted):
 *   · self-trade expire-resting: no same-account fill; own rest cancelled
 *     `self_trade_prevention`; taker continues against remaining book.
 *   · fill payloads use maker price + decimal strings (no JSON numbers).
 *   · IOC remainder → cancellation reason `ioc_remainder` on the door.
 *   · post-only that would cross → `post_only_would_cross`, book unchanged.
 *   · duplicate live order id → `duplicate_order_id`, second submit no rest.
 *   · kill-switch → `engine_disabled`, journals nothing.
 *   · POST /reconcile quantity disagreement refuses with both remainings named.
 *   · GET /depth emits decimal-string tuples only.
 * Class: N (honesty). Leverage: registerRoutes + MatchingEngine + MemoryJournal
 *   (Phase A — deepen doors; do not rebuild matching).
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-unreachable-guard-public-doors-secret-32';
const MARKET = 'BTC-USDT';

function fixedClock(): () => Date {
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.UTC(2026, 0, 1) + tick * 1000);
  };
}

function buildEngine(journal: MemoryJournal = new MemoryJournal()): MatchingEngine {
  return new MatchingEngine({
    journal,
    bus: new MemoryEventBus('svc-matching'),
    clock: fixedClock(),
    snapshotEvery: 0,
  });
}

async function mount(engine: MatchingEngine): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return app;
}

function lifecycleProof(action: 'PLACE' | 'PLACE_POST_ONLY' = 'PLACE') {
  const observedAt = '2026-08-24T16:00:00.000Z';
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
      allowedActions: ['PLACE', 'PLACE_POST_ONLY'],
      transitionId: 'test.transition',
      evidenceRefs: ['test.evidence'],
    },
    action,
  );
}

function limitBody(
  orderId: string,
  accountId: string,
  side: 'buy' | 'sell',
  qty: string,
  price: string,
  tif: 'GTC' | 'IOC' | 'FOK' | 'PO' = 'GTC',
) {
  return {
    orderId,
    accountId,
    type: 'limit' as const,
    side,
    qty,
    price,
    tif,
    lifecycleProof: lifecycleProof(tif === 'PO' ? 'PLACE_POST_ONLY' : 'PLACE'),
  };
}

async function submit(
  app: FastifyInstance,
  body: ReturnType<typeof limitBody> | Record<string, unknown>,
): Promise<ReturnType<FastifyInstance['inject']>> {
  const payload = JSON.stringify(body);
  return app.inject({
    method: 'POST',
    url: `/markets/${MARKET}/orders`,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

async function reconcile(
  app: FastifyInstance,
  orders: Array<{
    orderId: string;
    marketId: string;
    state: 'pending' | 'open' | 'terminal';
    remaining: string;
    funded: boolean;
    detail?: string;
  }>,
): Promise<ReturnType<FastifyInstance['inject']>> {
  const payload = JSON.stringify({ orders });
  return app.inject({
    method: 'POST',
    url: '/reconcile',
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

function assertNoJsonNumbers(value: unknown, path = '$'): void {
  if (typeof value === 'number') {
    throw new Error(`money amount at ${path} left as JSON number ${value}`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoJsonNumbers(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // sequence / counts are integers by design — only amounts must be strings.
      if (k === 'sequence' || k === 'version' || k === 'agreed' || k === 'refusals' || k === 'checked' || k === 'autos') continue;
      assertNoJsonNumbers(v, `${path}.${k}`);
    }
  }
}

describe('D26-P2-03 public doors — self-trade + maker price', () => {
  it('expire-resting STP: no same-account fill; rest cancelled; taker continues', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const own = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const stranger = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const aggressor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    expect((await submit(app, limitBody(own, 'acct-same', 'buy', '1', '100'))).statusCode).toBe(200);
    expect((await submit(app, limitBody(stranger, 'acct-stranger', 'buy', '1', '100'))).statusCode).toBe(200);

    const res = await submit(app, limitBody(aggressor, 'acct-same', 'sell', '2', '100'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.rejected).toBeNull();
    expect(body.fills).toHaveLength(1);
    expect(body.fills[0].makerOrderId).toBe(stranger);
    expect(body.fills[0].makerAccountId).toBe('acct-stranger');
    expect(body.fills[0].takerAccountId).toBe('acct-same');
    expect(body.fills[0].qty).toBe('1');
    expect(body.cancellations).toHaveLength(1);
    expect(body.cancellations[0].orderId).toBe(own);
    expect(body.cancellations[0].reason).toBe('self_trade_prevention');
    expect(body.cancellations[0].remainingQty).toBe('1');
    expect(body.resting.orderId).toBe(aggressor);
    expect(
      engine
        .book(MARKET)
        .toState()
        .asks.map((l) => l.orders.map((o) => o.orderId)),
    ).toEqual([[aggressor]]);
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    assertNoJsonNumbers(body.fills);
    assertNoJsonNumbers(body.cancellations);

    await app.close();
  });

  it('crossed fill through the submit door uses maker price, not taker limit', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const maker = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const taker = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await submit(app, limitBody(maker, 'acct-mm', 'sell', '2', '100.25'));
    const res = await submit(app, limitBody(taker, 'acct-tk', 'buy', '1.5', '101'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fills).toEqual([
      expect.objectContaining({
        makerOrderId: maker,
        price: '100.25',
        qty: '1.5',
      }),
    ]);
    // Taker improved the book; settlement must still see maker price on the wire.
    expect(body.fills[0].price).not.toBe('101');
    assertNoJsonNumbers(body.fills);

    await app.close();
  });
});

describe('D26-P2-03 public doors — TIF / identity / kill-switch', () => {
  it('IOC remainder cancels through the door with reason ioc_remainder', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const maker = '11111111-1111-4111-8111-111111111111';
    const taker = '22222222-2222-4222-8222-222222222222';

    await submit(app, limitBody(maker, 'acct-mm', 'sell', '1', '100'));
    const res = await submit(app, limitBody(taker, 'acct-tk', 'buy', '3', '100', 'IOC'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.fills).toEqual([expect.objectContaining({ qty: '1', price: '100' })]);
    expect(body.resting).toBeNull();
    expect(body.cancellations).toEqual([
      expect.objectContaining({
        orderId: taker,
        remainingQty: '2',
        reason: 'ioc_remainder',
      }),
    ]);

    await app.close();
  });

  it('post-only that would cross is rejected on the door and leaves depth unchanged', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const maker = '33333333-3333-4333-8333-333333333333';
    await submit(app, limitBody(maker, 'acct-mm', 'sell', '2', '100'));
    const before = (await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` })).json();

    const res = await submit(app, limitBody('44444444-4444-4444-8444-444444444444', 'acct-tk', 'buy', '1', '100', 'PO'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      accepted: false,
      rejected: { code: 'post_only_would_cross' },
      fills: [],
      resting: null,
    });

    const after = (await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` })).json();
    expect(after).toEqual(before);

    await app.close();
  });

  it('duplicate live order id is rejected on the door — bot retry cannot open a second rest', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const id = '55555555-5555-4555-8555-555555555555';
    expect((await submit(app, limitBody(id, 'acct-a', 'buy', '1', '100'))).statusCode).toBe(200);

    const again = await submit(app, limitBody(id, 'acct-a', 'buy', '9', '99'));
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({
      accepted: false,
      rejected: { code: 'duplicate_order_id' },
      fills: [],
      resting: null,
    });

    const live = await app.inject({
      method: 'GET',
      url: `/markets/${MARKET}/orders`,
      headers: serviceAuthHeadersForBody('svc-trade', SECRET, ''),
    });
    expect(live.json().orders).toHaveLength(1);
    expect(live.json().orders[0]).toMatchObject({ orderId: id, remaining: '1' });

    await app.close();
  });

  it('kill-switch refuses submit on the door as engine_disabled and journals nothing', async () => {
    const journal = new MemoryJournal();
    const engine = buildEngine(journal);
    const app = await mount(engine);

    engine.setEnabled(false);
    const beforeLen = journal.read().length;

    const res = await submit(app, limitBody('66666666-6666-4666-8666-666666666666', 'acct-a', 'buy', '1', '100'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      accepted: false,
      rejected: { code: 'engine_disabled' },
      fills: [],
      resting: null,
    });
    expect(journal.read()).toHaveLength(beforeLen);
    expect(engine.markets).toEqual([]);

    await app.close();
  });
});

describe('D26-P2-03 public doors — reconcile + depth honesty', () => {
  it('POST /reconcile refuses quantity disagreement naming both remainings (real engine)', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const maker = '77777777-7777-4777-8777-777777777777';
    const taker = '88888888-8888-4888-8888-888888888888';
    await submit(app, limitBody(maker, 'acct-mm', 'sell', '5', '100'));
    await submit(app, limitBody(taker, 'acct-tk', 'buy', '2', '100'));

    // Counterpart never saw the fill — still believes 5 working + funded.
    const res = await reconcile(app, [
      {
        orderId: maker,
        marketId: MARKET,
        state: 'open',
        remaining: '5',
        funded: true,
        detail: 'hold=500 USDT',
      },
    ]);
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.ok).toBe(false);
    expect(report.refusals).toBeGreaterThanOrEqual(1);
    const finding = report.findings.find((f: { orderId: string }) => f.orderId === maker);
    expect(finding).toMatchObject({
      case: 'quantity_disagreement',
      verdict: 'refuse',
    });
    expect(finding.engine).toContain('remaining=3');
    expect(finding.counterpart).toContain('remaining=5');
    // Read-only: the maker rest is still live after the refuse.
    const live = await app.inject({
      method: 'GET',
      url: `/markets/${MARKET}/orders`,
      headers: serviceAuthHeadersForBody('svc-trade', SECRET, ''),
    });
    expect(live.json().orders.map((o: { orderId: string }) => o.orderId)).toContain(maker);

    await app.close();
  });

  it('GET /depth emits decimal-string level tuples — never JSON numbers', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    await submit(app, limitBody('99999999-9999-4999-8999-999999999999', 'acct-a', 'buy', '1.125', '100.5'));
    await submit(app, limitBody('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'acct-b', 'sell', '2.5', '101.25'));

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
    expect(res.statusCode).toBe(200);
    const depth = res.json();
    expect(depth.bids[0]).toEqual(['100.5', '1.125']);
    expect(depth.asks[0]).toEqual(['101.25', '2.5']);
    for (const [px, qty] of [...depth.bids, ...depth.asks] as [string, string][]) {
      expect(typeof px).toBe('string');
      expect(typeof qty).toBe('string');
    }
    assertNoJsonNumbers(depth.bids);
    assertNoJsonNumbers(depth.asks);

    await app.close();
  });
});
