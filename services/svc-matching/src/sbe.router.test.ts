import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createSbeCodec, loadJavaSbeCodec, SBE_UNAVAILABLE, type JavaSbeCodec, type SbeCodec } from '@intafaced/sbe-codec';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';
import { userCopy } from './user-copy.js';
import {
  isRealLogicDepthFrame,
  MATCHING_SBE_REFUSE_HTTP,
  MATCHING_SBE_UNAVAILABLE,
  readSbeHeader,
  SBE_DEPTH_TEMPLATE_ID,
  SBE_SCHEMA_ID,
} from './sbe-l2.js';

/**
 * GET /depth?format=sbe and GET /depth/sbe speak Real Logic octets or refuse.
 * They never return the JSON ladder labeled as SBE.
 */

const SECRET = 'matching-sbe-router-secret-32chars!!';
const MARKET = 'BTC-USDT';
const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

function proofFor(marketId: string) {
  const observedAt = '2026-08-25T16:00:00.000Z';
  return createMarketLifecycleAdmissionProof(
    {
      marketId,
      ruleVersion: 'test.rules.v1',
      instrumentId: marketId,
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
    'PLACE',
  );
}

function submitBody(orderId: string, accountId: string, side: 'buy' | 'sell', qty: string, price: string) {
  return {
    orderId,
    accountId,
    type: 'limit' as const,
    side,
    qty,
    price,
    tif: 'GTC' as const,
    lifecycleProof: proofFor(MARKET),
  };
}

async function mount(engine: MatchingEngine, sbe: SbeCodec): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require', sbe });
  await app.ready();
  return app;
}

function buildEngine(): MatchingEngine {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
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

function stubUtf8Java(): JavaSbeCodec {
  return {
    handle(json: string): string {
      const req = JSON.parse(json) as Record<string, unknown>;
      const marker = ['DepthLevel', String(req.instrument), String(req.side), String(req.price)].join(':');
      return JSON.stringify({ ok: true, template: 'DepthLevel', payloadB64: Buffer.from(marker, 'utf8').toString('base64') });
    },
  };
}

async function seedBook(app: FastifyInstance): Promise<void> {
  const maker = await post(app, `/markets/${MARKET}/orders`, submitBody(FIRST, 'maker-a', 'sell', '1', '101'));
  expect(maker.statusCode).toBe(200);
  const bid = await post(app, `/markets/${MARKET}/orders`, submitBody(SECOND, 'maker-b', 'buy', '1', '100'));
  expect(bid.statusCode).toBe(200);
}

describe('matching SBE HTTP — octets or refuse, never utf8 JSON as SBE', () => {
  it('GET /depth without format stays JSON L2', async () => {
    const engine = buildEngine();
    const app = await mount(engine, createSbeCodec({ java: null }));
    await seedBook(app);

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.json().bids).toEqual([['100', '1']]);
    expect(res.json().asks).toEqual([['101', '1']]);

    await app.close();
  });

  it('GET /depth?format=sbe with unlinked codec refuses and does not serve JSON bids', async () => {
    const engine = buildEngine();
    const app = await mount(engine, createSbeCodec({ java: null }));
    await seedBook(app);

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50&format=sbe` });
    expect(res.statusCode).toBe(MATCHING_SBE_REFUSE_HTTP);
    const body = res.json() as { code: string; reason: string; bids?: unknown; asks?: unknown };
    expect(body.code).toBe(MATCHING_SBE_UNAVAILABLE);
    expect(body.reason).toBe(SBE_UNAVAILABLE);
    expect(body.bids).toBeUndefined();
    expect(body.asks).toBeUndefined();
    expect(res.payload).not.toMatch(/"bids"/);
    expect(userCopy('matching.sbe_unavailable')).toBeTruthy();

    await app.close();
  });

  it('GET /depth/sbe with utf8 stub codec refuses — that marker is not SBE', async () => {
    const engine = buildEngine();
    const app = await mount(engine, createSbeCodec({ java: stubUtf8Java() }));
    await seedBook(app);

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/sbe?limit=50` });
    expect(res.statusCode).toBe(MATCHING_SBE_REFUSE_HTTP);
    expect(res.json()).toMatchObject({ code: MATCHING_SBE_UNAVAILABLE, reason: SBE_UNAVAILABLE });
    expect(res.payload).not.toMatch(/"bids"/);
    expect(res.payload).not.toContain('DepthLevel:');

    await app.close();
  });

  it('never-traded market SBE is 404, not an invented binary book', async () => {
    const engine = buildEngine();
    const app = await mount(engine, createSbeCodec({ java: null }));
    const ghost = 'NEVER-TRADED-SBE';

    const res = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50&format=sbe` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    expect(engine.hasMarket(ghost)).toBe(false);

    await app.close();
  });

  it('linked Real Logic codec serves octet-stream schemaId 101 on format=sbe', async ({ skip }) => {
    const java = loadJavaSbeCodec();
    if (java === null) {
      skip('Java SBE not linked. Honest skip — utf8 stub is not this test.');
      return;
    }
    const engine = buildEngine();
    const app = await mount(engine, createSbeCodec({ java }));
    await seedBook(app);

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50&format=sbe` });
    expect(res.statusCode, res.payload).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/octet-stream/);
    expect(res.headers['x-intafaced-book']).toBe('L2');
    expect(res.headers['x-intafaced-template']).toBe('DepthLevel');
    const raw = Buffer.from(res.rawPayload);
    expect(raw.byteLength).toBeGreaterThanOrEqual(8);
    const header = readSbeHeader(raw);
    expect(header?.schemaId).toBe(SBE_SCHEMA_ID);
    expect(header?.templateId).toBe(SBE_DEPTH_TEMPLATE_ID);
    expect(isRealLogicDepthFrame(raw.subarray(0, 8 + (header?.blockLength ?? 0)))).toBe(true);
    expect(raw.toString('utf8').startsWith('DepthLevel:')).toBe(false);
    expect(raw.toString('utf8').startsWith('{')).toBe(false);

    await app.close();
  }, 180_000);
});
