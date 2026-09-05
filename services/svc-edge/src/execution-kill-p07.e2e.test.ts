import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { createAdminApi } from './admin-api.js';
import { registerAdminRoutes, registerKillSwitchGuard } from './control-plane.js';
import { KillSwitchState } from './kill-switch.js';

/**
 * P-07 — execution module kill-switch e2e proof on svc-edge.
 * Same harness as control-plane.e2e.test.ts; isolated so the lane ships without
 * rewriting the large control-plane file.
 */
const tokens: TokenConfig = {
  secret: 'test-only-signing-secret-at-least-32-characters-long',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const CONFIRM = '44444444-4444-4444-8444-444444444444';
const SESSION = '22222222-2222-4222-8222-222222222222';

async function bearer(scopes: string[]): Promise<string> {
  const { token } = await issueAccessToken({ userId: OPERATOR, sessionId: SESSION, scopes, tier: 'institutional', mfa: true }, tokens);
  return `Bearer ${token}`;
}

interface Harness {
  app: FastifyInstance;
  state: KillSwitchState;
  reached: string[];
}

let harness: Harness | null = null;

async function edge(): Promise<Harness> {
  const app = Fastify({ logger: false });
  const state = new KillSwitchState();
  const reached: string[] = [];

  registerKillSwitchGuard(app, state);
  registerAdminRoutes(app, createAdminApi(state, { tokens, ledger: null }));

  app.all('/api/*', async (req) => {
    reached.push(`${req.method} ${req.url}`);
    return { ok: true };
  });

  await app.ready();
  harness = { app, state, reached };
  return harness;
}

afterEach(async () => {
  await harness?.app.close();
  harness = null;
});

async function flip(h: Harness, module: string, disabled: boolean, reason: string) {
  return h.app.inject({
    method: 'POST',
    url: '/admin/kill-switches',
    headers: { authorization: await bearer(['admin:write']) },
    payload: { module, disabled, reason, confirmOperatorId: CONFIRM },
  });
}

describe('execution module — kill surface (P-07)', () => {
  it('arms execution from POST /admin/kill-switches', async () => {
    const h = await edge();
    const res = await flip(h, 'execution', true, 'P-07 halt execution OMS during completeness drill');
    expect(res.statusCode).toBe(200);
    expect(h.state.isKilled('execution')).toBe(true);
  });

  it('REFUSES /api/execution once killed — upstream never reached', async () => {
    const h = await edge();
    h.reached.length = 0;
    await flip(h, 'execution', true, 'P-07 refuse proof for execution public door');
    const res = await h.app.inject({ method: 'POST', url: '/api/execution/trpc/execution.oms.plan' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'edge.module_killed', module: 'execution' });
    expect(h.reached).toEqual([]);
    await flip(h, 'execution', false, 'P-07 resume execution after refuse proof');
  });
});
