import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { registerInternalEmissions } from './internal-emissions.js';

/**
 * Cron mint boundary — kill-switch + auth + money wire.
 *
 * tRPC mintEpoch already refuses when emissionsEnabled is false. This is the
 * path the README prefers for production (external cron). Without this extract
 * the route was untestable and the kill-switch at the HTTP boundary had no proof.
 */

const SECRET = 'test-internal-secret-for-token-emissions';

async function build(opts: { emissionsEnabled: boolean; mintNextEpoch?: () => Promise<{ epoch: number; minted: bigint }> }) {
  const mintNextEpoch = opts.mintNextEpoch ?? vi.fn(async () => ({ epoch: 0, minted: parseAmount('136000') }));
  const app = Fastify();
  registerInternalEmissions(app, {
    internalSecret: SECRET,
    emissionsEnabled: opts.emissionsEnabled,
    mintNextEpoch,
  });
  await app.ready();
  return { app, mintNextEpoch };
}

const post = (app: Awaited<ReturnType<typeof build>>['app'], headers?: Record<string, string>) =>
  app.inject({ method: 'POST', url: '/internal/emissions/mint-next', headers });

describe('POST /internal/emissions/mint-next', () => {
  it('401 without service auth and never mints', async () => {
    const { app, mintNextEpoch } = await build({ emissionsEnabled: true });
    const res = await post(app);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('token.unauthenticated');
    expect(mintNextEpoch).not.toHaveBeenCalled();
    await app.close();
  });

  it('403 when HMAC caller is not svc-token and never mints', async () => {
    const { app, mintNextEpoch } = await build({ emissionsEnabled: true });
    const res = await post(app, serviceAuthHeaders('svc-trade', SECRET));
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('token.forbidden');
    expect(mintNextEpoch).not.toHaveBeenCalled();
    await app.close();
  });

  it('503 when emissions are disabled — kill-switch, zero mint', async () => {
    const { app, mintNextEpoch } = await build({ emissionsEnabled: false });
    const res = await post(app, serviceAuthHeaders('svc-token', SECRET));
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('token.emissions_disabled');
    expect(mintNextEpoch).not.toHaveBeenCalled();
    await app.close();
  });

  it('200 with decimal minted amount when enabled', async () => {
    const minted = parseAmount('136000');
    const { app, mintNextEpoch } = await build({
      emissionsEnabled: true,
      mintNextEpoch: vi.fn(async () => ({ epoch: 3, minted })),
    });
    const res = await post(app, serviceAuthHeaders('svc-token', SECRET));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ epoch: 3, minted: formatAmount(minted) });
    expect(res.json().minted).toBe('136000');
    expect(res.json().minted).not.toBe(minted.toString());
    expect(mintNextEpoch).toHaveBeenCalledOnce();
    await app.close();
  });

  it('400 fail-closed when mint throws — never 200 on a failed mint', async () => {
    const { app } = await build({
      emissionsEnabled: true,
      mintNextEpoch: vi.fn(async () => {
        const err = new Error('Emission schedule is exhausted') as Error & { code: string };
        err.code = 'token.supply_exhausted';
        throw err;
      }),
    });
    const res = await post(app, serviceAuthHeaders('svc-token', SECRET));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('token.supply_exhausted');
    await app.close();
  });
});
