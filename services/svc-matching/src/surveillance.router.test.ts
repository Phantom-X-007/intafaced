/**
 * H9 HTTP door: GET /surveillance/cases lists open journalled cases.
 * POST adjudicate refuses auto_adjudicate_forbidden. POST fine refuses invented_sanction.
 * Owner thresholds stay detector_gap. No invented magnitudes.
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { AUTO_CLOSE_FORBIDDEN, INVENTED_SANCTION } from './engine/surveillance-case.js';
import {
  AUTO_ADJUDICATE_FORBIDDEN,
  DETECTOR_GAP,
  installSurveillancePersist,
  recordOpenSurveillanceCase,
} from './engine/surveillance-persist.js';
import { registerRoutes } from './router.js';

installSurveillancePersist();

const SECRET = 'matching-h9-surveillance-router-secret-32';
const MARKET = 'BTC-USDT';
const OWN = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';

function proofFor() {
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
      allowedActions: ['PLACE', 'PLACE_POST_ONLY'],
      transitionId: 'test.transition',
      evidenceRefs: ['test.evidence'],
    },
    'PLACE',
  );
}

function submitBody(over: Record<string, unknown> = {}) {
  return {
    orderId: OWN,
    accountId: 'desk',
    type: 'limit' as const,
    side: 'buy' as const,
    qty: '1',
    price: '100',
    tif: 'GTC' as const,
    lifecycleProof: proofFor(),
    ...over,
  };
}

async function mount(): Promise<{ app: FastifyInstance; engine: MatchingEngine }> {
  const engine = new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return { app, engine };
}

function signedGet(app: FastifyInstance, url: string) {
  return app.inject({
    method: 'GET',
    url,
    headers: { ...serviceAuthHeadersForBody('svc-trade', SECRET, '') },
  });
}

function signedPost(app: FastifyInstance, url: string, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

describe('H9 GET /surveillance/cases — journal list, no auto-fine', () => {
  it('lists named spoofing/layering as open evidence and names detector_gap', async () => {
    const { app, engine } = await mount();
    recordOpenSurveillanceCase(engine, { accountId: 'desk', marketId: MARKET, reason: 'spoofing' });
    recordOpenSurveillanceCase(engine, { accountId: 'desk', marketId: MARKET, reason: 'layering' });

    const res = await signedGet(app, '/surveillance/cases');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cases).toEqual([
      { accountId: 'desk', marketId: MARKET, reason: 'layering', status: 'open' },
      { accountId: 'desk', marketId: MARKET, reason: 'spoofing', status: 'open' },
    ]);
    expect(body.cases.every((row: { status: string }) => row.status === 'open')).toBe(true);
    expect(JSON.stringify(body)).not.toContain('fine');
    expect(body.detectors.spoofing).toMatchObject({ enabled: false, gap: DETECTOR_GAP, threshold: null });
    expect(body.detectors.layering).toMatchObject({ enabled: false, gap: DETECTOR_GAP, threshold: null });
    expect(body.detectors.spoofing.threshold).not.toBe(0);
    await app.close();
  });

  it('lists self_trade opened on the matching door', async () => {
    const { app } = await mount();
    expect(
      (await signedPost(app, `/markets/${MARKET}/orders`, submitBody({ orderId: OWN, accountId: 'same', side: 'sell' }))).statusCode,
    ).toBe(200);
    expect(
      (await signedPost(app, `/markets/${MARKET}/orders`, submitBody({ orderId: TAKE, accountId: 'same', side: 'buy' }))).statusCode,
    ).toBe(200);

    const res = await signedGet(app, '/surveillance/cases');
    expect(res.statusCode).toBe(200);
    expect(res.json().cases).toEqual([{ accountId: 'same', marketId: MARKET, reason: 'self_trade', status: 'open' }]);
    await app.close();
  });

  it('unauthenticated list is 401 — cases carry account ids', async () => {
    const { app } = await mount();
    const res = await app.inject({ method: 'GET', url: '/surveillance/cases' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /surveillance/adjudicate refuses auto_adjudicate_forbidden and leaves cases open', async () => {
    const { app, engine } = await mount();
    recordOpenSurveillanceCase(engine, { accountId: 'desk', marketId: MARKET, reason: 'spoofing' });

    const res = await signedPost(app, '/surveillance/adjudicate', { reason: 'spoofing' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });
    expect(res.json().cases).toEqual([{ accountId: 'desk', marketId: MARKET, reason: 'spoofing', status: 'open' }]);
    expect(engine.openSurveillanceCases()[0]!.status).toBe('open');
    await app.close();
  });

  it('POST /surveillance/fine refuses invented_sanction and posts no amount', async () => {
    const { app } = await mount();
    const res = await signedPost(app, '/surveillance/fine', { reason: 'spoofing', amount: '100' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, code: INVENTED_SANCTION, amount: null });
    expect(res.json().code).not.toBe(AUTO_CLOSE_FORBIDDEN);
    await app.close();
  });
});
