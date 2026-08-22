import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { QUANT_COMPOSITE_HONESTY_PATH, registerQuantCompositeHonestyRoutes } from './quant-composite-honesty-door.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

async function buildDoor() {
  const app = Fastify({ logger: false });
  registerQuantCompositeHonestyRoutes(app);
  await app.ready();
  apps.push(app);
  return app;
}

function honestCompositePayload(overrides: Record<string, unknown> = {}) {
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
    backtest: {
      outOfSampleVerdict: 'pass',
      costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
      variantCount: 37,
    },
    leaderboard: { rankedByHistoricalReturn: false, surface: 'backtest' },
    compare: {
      showsLivePnl: true,
      showsBacktestPnl: true,
      liveLabelWeight: 'normal',
      backtestLabelWeight: 'normal',
    },
    ...overrides,
  };
}

describe('svc-edge quant composite honesty door — D35', () => {
  it('allows honest backtest + render framing', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_COMPOSITE_HONESTY_PATH,
      payload: honestCompositePayload(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; surface: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.surface).not.toHaveProperty('returns');
    expect(body.surface.claimLabel).toBe('Historical simulation — not a forecast');
  });

  it('refuses dishonest backtest before surface render', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_COMPOSITE_HONESTY_PATH,
      payload: honestCompositePayload({ outOfSampleVerdict: null }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      ok: false,
      stage: 'backtest',
      refusal: { code: 'missing_out_of_sample_verdict' },
    });
  });

  it('refuses dishonest render framing after backtest passes', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_COMPOSITE_HONESTY_PATH,
      payload: honestCompositePayload({
        leaderboard: { rankedByHistoricalReturn: true, surface: 'copy' },
      }),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      ok: false,
      stage: 'surface_render',
      reason: 'returns_leaderboard',
    });
  });
});
