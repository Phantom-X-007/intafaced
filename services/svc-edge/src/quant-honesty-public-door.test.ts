import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  QUANT_HONESTY_ASSESS_PATH,
  QUANT_HONESTY_COMPARISON_PATH,
  QUANT_HONESTY_LABELS_PATH,
  registerQuantHonestyRoutes,
} from './quant-honesty-door.js';

/**
 * D26-P1-X6 — honesty contract reachable on a shipped svc-edge door.
 * Package-only tests are not enough: incomplete backtests must refuse here by name.
 */

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const a = apps.pop();
    if (a) await a.close();
  }
});

async function buildDoor() {
  const app = Fastify({ logger: false });
  registerQuantHonestyRoutes(app);
  await app.ready();
  apps.push(app);
  return app;
}

function honestPayload(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-2026-08-15-001',
    strategyId: 'strategy-mean-reversion-v4',
    strategyVariantCount: 37,
    outOfSampleVerdict: {
      status: 'passed',
      evaluatedFrom: '2026-04-01T00:00:00.000Z',
      evaluatedTo: '2026-06-30T23:59:59.999Z',
      sampleCount: 2_184,
    },
    costModel: {
      fees: { kind: 'venue-schedule', source: 'connect:venue-a:fee-schedule:v7' },
      slippage: { kind: 'order-book-replay', source: 'connect:data-lake:venue-a:depth:v3' },
      latency: { kind: 'measured-distribution', source: 'connect:venue-a:round-trip:2026-q2' },
    },
    ...overrides,
  };
}

describe('svc-edge Quant honesty public door — D26-P1-X6', () => {
  it('refuses missing out-of-sample by name', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_HONESTY_ASSESS_PATH,
      payload: honestPayload({ outOfSampleVerdict: null }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      ok: false,
      refusal: { code: 'missing_out_of_sample_verdict' },
    });
  });

  it.each([
    ['fees', 'missing_fee_model'],
    ['slippage', 'missing_slippage_model'],
    ['latency', 'missing_latency_model'],
  ] as const)('refuses missing %s by name', async (component, expectedCode) => {
    const app = await buildDoor();
    const payload = honestPayload();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_HONESTY_ASSESS_PATH,
      payload: {
        ...payload,
        costModel: { ...payload.costModel, [component]: null },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().ok).toBe(false);
    expect(res.json().refusal.code).toBe(expectedCode);
  });

  it('refuses returns-ranked comparison order by name', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_HONESTY_COMPARISON_PATH,
      payload: { order: 'historical_return' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      ok: false,
      refusal: { code: 'returns_ranked_leaderboard_forbidden' },
    });
  });

  it('does not compute or echo a returns field on a complete candidate', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_HONESTY_ASSESS_PATH,
      payload: honestPayload({ returns: 0.42, historicalReturn: '42%' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      surface: Record<string, unknown>;
      labels: { live: { visualWeight: string }; backtest: { visualWeight: string } };
    };
    expect(body.ok).toBe(true);
    expect(body.surface).not.toHaveProperty('returns');
    expect(body.surface).not.toHaveProperty('historicalReturn');
    expect(JSON.stringify(body)).not.toMatch(/0\.42/);
    expect(body.surface.claimLabel).toBe('Historical simulation — not a forecast');
    expect(body.labels.live.visualWeight).toBe('primary');
    expect(body.labels.backtest.visualWeight).toBe('primary');
  });

  it('exposes equal-weight live vs simulation labels', async () => {
    const app = await buildDoor();
    const res = await app.inject({ method: 'GET', url: QUANT_HONESTY_LABELS_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      labels: {
        live: { text: 'Live performance', visualWeight: 'primary' },
        backtest: { text: 'Historical simulation', visualWeight: 'primary' },
      },
    });
  });
});

describe('quant honesty door is not a leaderboard', () => {
  it('allows only stable non-performance order through the HTTP door', async () => {
    const app = await buildDoor();
    const ok = await app.inject({
      method: 'POST',
      url: QUANT_HONESTY_COMPARISON_PATH,
      payload: { order: 'strategy_name' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true, order: 'strategy_name' });
  });
});
