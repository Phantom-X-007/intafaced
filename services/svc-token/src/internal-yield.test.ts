import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { registerInternalYield } from './internal-yield.js';

const SECRET = 'test-internal-secret-for-token-yield';

async function build(opts: {
  yieldJobEnabled: boolean;
  runWindow?: () => Promise<{
    windowId: string;
    distributed: bigint;
    recipients: number;
    skipped: number;
    alreadyPaid: number;
  }>;
}) {
  const runWindow =
    opts.runWindow ??
    vi.fn(async () => ({
      windowId: 'w1',
      distributed: parseAmount('55'),
      recipients: 2,
      skipped: 0,
      alreadyPaid: 0,
    }));
  const app = Fastify();
  registerInternalYield(app, {
    internalSecret: SECRET,
    yieldJobEnabled: opts.yieldJobEnabled,
    runWindow,
  });
  await app.ready();
  return { app, runWindow };
}

const post = (app: Awaited<ReturnType<typeof build>>['app'], body: Record<string, unknown>, headers?: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: '/internal/yield/run-window',
    headers: { 'content-type': 'application/json', ...headers },
    payload: body,
  });

describe('POST /internal/yield/run-window', () => {
  it('401 without service auth and never runs', async () => {
    const { app, runWindow } = await build({ yieldJobEnabled: true });
    const res = await post(app, { windowId: 'w1' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('token.unauthenticated');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('403 when HMAC caller is not svc-token and never runs', async () => {
    const { app, runWindow } = await build({ yieldJobEnabled: true });
    const res = await post(app, { windowId: 'w1' }, serviceAuthHeaders('svc-trade', SECRET));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('token.forbidden');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('503 when the job is unset — kill-switch, zero payout', async () => {
    const { app, runWindow } = await build({ yieldJobEnabled: false });
    const res = await post(app, { windowId: 'w1' }, serviceAuthHeaders('svc-token', SECRET));
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('token.yield_job_unset');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('400 when the body carries caller-typed sources — never distributes', async () => {
    const { app, runWindow } = await build({ yieldJobEnabled: true });
    const res = await post(app, { windowId: 'w1', sources: [{ module: 'trade', amount: '999' }] }, serviceAuthHeaders('svc-token', SECRET));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('token.yield_job_unset');
    expect(runWindow).not.toHaveBeenCalled();
    await app.close();
  });

  it('200 with decimal distributed amount when enabled', async () => {
    const distributed = parseAmount('55');
    const { app, runWindow } = await build({
      yieldJobEnabled: true,
      runWindow: vi.fn(async () => ({
        windowId: 'w-ok',
        distributed,
        recipients: 2,
        skipped: 0,
        alreadyPaid: 0,
      })),
    });
    const res = await post(app, { windowId: 'w-ok' }, serviceAuthHeaders('svc-token', SECRET));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      windowId: 'w-ok',
      distributed: formatAmount(distributed),
      recipients: 2,
      skipped: 0,
      alreadyPaid: 0,
    });
    expect(res.json().distributed).toBe('55');
    expect(res.json().distributed).not.toBe(distributed.toString());
    expect(runWindow).toHaveBeenCalledWith({ windowId: 'w-ok' });
    await app.close();
  });
});
