import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { registerInternalBuyback } from './internal-buyback.js';

const SECRET = 'test-internal-secret-for-token-buyback';
const RUN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WINDOW = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' };

async function build(opts: {
  buybackJobEnabled: boolean;
  runWindow?: () => Promise<{
    runId: string;
    tokensBought: bigint;
    burned: bigint;
    toRewards: bigint;
  }>;
}) {
  const runWindow =
    opts.runWindow ??
    vi.fn(async () => ({
      runId: RUN,
      tokensBought: parseAmount('10'),
      burned: parseAmount('6'),
      toRewards: parseAmount('4'),
    }));
  const app = Fastify();
  registerInternalBuyback(app, {
    internalSecret: SECRET,
    buybackJobEnabled: opts.buybackJobEnabled,
    runWindow,
  });
  await app.ready();
  return { app, runWindow };
}

const s2s = (service: string, body: Record<string, unknown>) => serviceAuthHeadersForBody(service, SECRET, JSON.stringify(body));

const post = (app: Awaited<ReturnType<typeof build>>['app'], body: Record<string, unknown>, headers?: Record<string, string>) => {
  const payload = JSON.stringify(body);
  return app.inject({
    method: 'POST',
    url: '/internal/buyback/run-window',
    headers: { 'content-type': 'application/json', ...headers },
    payload,
  });
};

describe('POST /internal/buyback/run-window', () => {
  it('401 without service auth and never runs', async () => {
    const { app, runWindow } = await build({ buybackJobEnabled: true });
    const res = await post(app, { runId: RUN, revenueWindow: WINDOW });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('token.unauthenticated');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('403 when HMAC caller is not svc-token and never runs', async () => {
    const { app, runWindow } = await build({ buybackJobEnabled: true });
    const res = await post(app, { runId: RUN, revenueWindow: WINDOW }, s2s('svc-trade', { runId: RUN, revenueWindow: WINDOW }));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('token.forbidden');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('503 when the job is unset — kill-switch, zero burn', async () => {
    const { app, runWindow } = await build({ buybackJobEnabled: false });
    const res = await post(app, { runId: RUN, revenueWindow: WINDOW }, s2s('svc-token', { runId: RUN, revenueWindow: WINDOW }));
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('token.buyback_job_unset');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('400 when the body carries caller-typed tokensBought — never places', async () => {
    const { app, runWindow } = await build({ buybackJobEnabled: true });
    const res = await post(
      app,
      { runId: RUN, revenueWindow: WINDOW, tokensBought: '999' },
      s2s('svc-token', { runId: RUN, revenueWindow: WINDOW, tokensBought: '999' }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('token.buyback_job_unset');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('200 with decimal burned amount when enabled', async () => {
    const burned = parseAmount('6');
    const { app, runWindow } = await build({
      buybackJobEnabled: true,
      runWindow: vi.fn(async () => ({
        runId: RUN,
        tokensBought: parseAmount('10'),
        burned,
        toRewards: parseAmount('4'),
      })),
    });
    const res = await post(app, { runId: RUN, revenueWindow: WINDOW }, s2s('svc-token', { runId: RUN, revenueWindow: WINDOW }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      runId: RUN,
      tokensBought: '10',
      burned: formatAmount(burned),
      toRewards: '4',
    });
    expect(res.json().burned).toBe('6');
    expect(res.json().burned).not.toBe(burned.toString());
    expect(runWindow).toHaveBeenCalledWith({
      runId: RUN,
      revenueWindow: { from: new Date(WINDOW.from), to: new Date(WINDOW.to) },
    });
    await app.close();
  });

  it('401 when the signed bytes are not the bytes on the wire', async () => {
    const honest = JSON.stringify({ runId: RUN, revenueWindow: WINDOW });
    const tampered = JSON.stringify({ runId: RUN, revenueWindow: WINDOW, tokensBought: '999' });
    const { app, runWindow } = await build({ buybackJobEnabled: true });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/buyback/run-window',
      headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-token', SECRET, honest) },
      payload: tampered,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('token.unauthenticated');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });
});
