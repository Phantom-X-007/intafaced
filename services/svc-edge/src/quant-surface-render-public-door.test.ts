import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { QUANT_SURFACE_RENDER_PATH, registerQuantSurfaceRenderRoutes } from './quant-surface-render-door.js';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const app = apps.pop();
    if (app) await app.close();
  }
});

async function buildDoor() {
  const app = Fastify({ logger: false });
  registerQuantSurfaceRenderRoutes(app);
  await app.ready();
  apps.push(app);
  return app;
}

const honestPayload = {
  backtest: {
    outOfSampleVerdict: 'pass',
    costs: { feesModelled: true, slippageModelled: true, latencyModelled: true },
    variantCount: 3,
  },
  leaderboard: { rankedByHistoricalReturn: false, surface: 'backtest' },
  compare: {
    showsLivePnl: true,
    showsBacktestPnl: true,
    liveLabelWeight: 'normal',
    backtestLabelWeight: 'normal',
  },
};

describe('svc-edge quant surface render door — D34', () => {
  it('allows honest composite framing', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_SURFACE_RENDER_PATH,
      payload: honestPayload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('refuses returns leaderboard by name', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_SURFACE_RENDER_PATH,
      payload: {
        ...honestPayload,
        leaderboard: { rankedByHistoricalReturn: true, surface: 'copy' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      ok: false,
      reason: 'returns_leaderboard',
    });
  });

  it('refuses missing out-of-sample verdict', async () => {
    const app = await buildDoor();
    const res = await app.inject({
      method: 'POST',
      url: QUANT_SURFACE_RENDER_PATH,
      payload: {
        ...honestPayload,
        backtest: { ...honestPayload.backtest, outOfSampleVerdict: null },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      ok: false,
      reason: 'no_out_of_sample_verdict',
    });
  });
});
