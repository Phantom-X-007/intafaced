import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { issueAccessToken, type TokenConfig } from '@intafaced/auth';
import { createAdminApi, type LedgerOperatorCall } from './admin-api.js';
import { registerAdminRoutes, registerKillSwitchGuard } from './control-plane.js';
import { KillSwitchState } from './kill-switch.js';

/**
 * PULLING THE SWITCH, END TO END (§14.6).
 *
 * The DoD gate lists "kill-switch verified reachable from apps/admin" as a
 * manual sign-off item, and a kill-switch nobody has ever pulled is not a
 * kill-switch. So this file does not assert that an endpoint returns 200. It
 * mints a real operator token, sends a real HTTP request to the real
 * `/admin/kill-switches` route, and then sends real traffic at the modules to
 * prove the BEHAVIOUR changed.
 *
 * ── Why this is end-to-end and not a mock of one ────────────────────────────
 *
 * `registerKillSwitchGuard` and `registerAdminRoutes` are the same two functions
 * `index.ts` calls, in the same order, on the same kind of Fastify instance.
 * Nothing here is a parallel copy of the rule — a switch verified only through a
 * test-only path is not verified. What is stubbed is only what is on the far
 * side of the perimeter: the upstream services, which stand in for svc-trade,
 * svc-protocol and svc-token, and answer 200 so that a refusal can only have
 * come from the switch.
 *
 * The one thing this cannot cover is the proxy handler in `index.ts`, which
 * reads `env` and listens at module scope. It does not need to: the guard is an
 * `onRequest` hook, so it runs strictly before any handler, and a request that
 * the hook refuses never reaches one.
 */

const tokens: TokenConfig = {
  secret: 'test-only-signing-secret-at-least-32-characters-long',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const TRADER = '33333333-3333-4333-8333-333333333333';

async function bearer(scopes: string[], mfa = true, userId = OPERATOR): Promise<string> {
  const { token } = await issueAccessToken({ userId, sessionId: SESSION, scopes, tier: 'institutional', mfa }, tokens);
  return `Bearer ${token}`;
}

/** An operator who may halt a module. */
const asOperator = () => bearer(['admin:write']);
/** An operator who may halt the money plane. */
const asTreasury = () => bearer(['admin:treasury']);
/** An ordinary user session, exactly as svc-identity issues one. */
const asUser = () => bearer(['identity:read', 'identity:write', 'trade:read', 'trade:write', 'ledger:read'], true, TRADER);

interface Harness {
  app: FastifyInstance;
  state: KillSwitchState;
  /** Every upstream call the stub services saw. Empty means nothing got through. */
  reached: string[];
}

let harness: Harness | null = null;

async function edge(ledger: LedgerOperatorCall | null = null): Promise<Harness> {
  const app = Fastify({ logger: false });
  const state = new KillSwitchState();
  const reached: string[] = [];

  // THE SAME TWO CALLS `index.ts` MAKES, in the same order.
  registerKillSwitchGuard(app, state);
  registerAdminRoutes(app, createAdminApi(state, { tokens, ledger }));

  // The far side of the perimeter. Answers 200 to everything, so a non-200 can
  // only have come from the switch — which is the whole point of the assertion.
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

/** Flip a switch the way an operator does: over HTTP, with a token and a reason. */
async function flip(h: Harness, module: string, disabled: boolean, reason: string, auth?: string) {
  return h.app.inject({
    method: 'POST',
    url: '/admin/kill-switches',
    headers: { authorization: auth ?? (await asOperator()) },
    payload: { module, disabled, reason },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// trade.spot — §14's own worked example, and the asymmetry that is the point
// ─────────────────────────────────────────────────────────────────────────────

describe('trade.spot off: new risk refused, and the door out stays open', () => {
  const WHY = 'incident 2026-07-30, book quoting stale prices';

  it('accepts orders before the switch is pulled', async () => {
    const h = await edge();
    expect((await h.app.inject({ method: 'POST', url: '/api/v1/orders' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'POST', url: '/api/trade/trpc/orders.create' })).statusCode).toBe(200);
  });

  it('REFUSES a new order once trade is halted — over tRPC and over the CCXT REST path', async () => {
    const h = await edge();
    expect((await flip(h, 'trade', true, WHY)).statusCode).toBe(200);

    const trpc = await h.app.inject({ method: 'POST', url: '/api/trade/trpc/orders.create' });
    expect(trpc.statusCode).toBe(503);
    expect(trpc.json()).toMatchObject({ code: 'edge.module_killed', module: 'trade' });

    // The path a ccxt client actually uses. This is the one an earlier revision
    // left un-killable, because `/api/v1` does not spell "trade".
    const rest = await h.app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(rest.statusCode).toBe(503);
    expect(rest.json()).toMatchObject({ code: 'edge.module_killed', module: 'trade' });

    // Nothing reached svc-trade. A refusal that still forwards is not a halt.
    expect(h.reached).toEqual([]);
  });

  /**
   * THE HALF THAT MAKES IT A SAFETY CONTROL RATHER THAN A TRAP.
   *
   * An operator halting a market is stopping new risk, not confiscating
   * positions. A user must always be able to get out.
   */
  it('STILL LETS A USER CANCEL — over tRPC and over the CCXT REST path', async () => {
    const h = await edge();
    await flip(h, 'trade', true, WHY);

    expect((await h.app.inject({ method: 'POST', url: '/api/trade/trpc/orders.cancel' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'DELETE', url: '/api/v1/orders/8f3c1d2e-0000-4000-8000-000000000001' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'DELETE', url: '/api/v1/orders' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'DELETE', url: '/api/v1/orders?symbol=BTC/USDT' })).statusCode).toBe(200);

    // And they genuinely reached the service, rather than being answered by the
    // edge with a cheerful 200 that cancelled nothing.
    expect(h.reached).toHaveLength(4);
  });

  it('still serves the reads a user needs to see what they are cancelling', async () => {
    const h = await edge();
    await flip(h, 'trade', true, WHY);

    expect((await h.app.inject({ method: 'GET', url: '/api/v1/orders/open' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: '/api/v1/account/balance' })).statusCode).toBe(200);
  });

  it('leaves every other module alone', async () => {
    const h = await edge();
    await flip(h, 'trade', true, WHY);

    expect((await h.app.inject({ method: 'POST', url: '/api/identity/trpc/auth.login' })).statusCode).toBe(200);
    expect((await h.app.inject({ method: 'POST', url: '/api/pay/trpc/deposit.credit' })).statusCode).toBe(200);
  });

  it('comes back, so an incident can end', async () => {
    const h = await edge();
    await flip(h, 'trade', true, WHY);
    expect((await h.app.inject({ method: 'POST', url: '/api/v1/orders' })).statusCode).toBe(503);

    await flip(h, 'trade', false, 'feed recovered, resuming the market');
    expect((await h.app.inject({ method: 'POST', url: '/api/v1/orders' })).statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The relay, and emissions
// ─────────────────────────────────────────────────────────────────────────────

describe('the relay switch: the protocol path refuses', () => {
  it('refuses a relayed submission once protocol is halted', async () => {
    const h = await edge();
    expect((await h.app.inject({ method: 'POST', url: '/api/protocol/trpc/relay.submit' })).statusCode).toBe(200);

    await flip(h, 'protocol', true, 'sequencer wedged, stop accepting relayed transactions');

    const res = await h.app.inject({ method: 'POST', url: '/api/protocol/trpc/relay.submit' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'edge.module_killed', module: 'protocol' });
    expect(h.reached).toHaveLength(1); // only the pre-halt call
  });

  it('still lets a user read their own protocol state during the halt', async () => {
    const h = await edge();
    await flip(h, 'protocol', true, 'sequencer wedged, stop accepting relayed transactions');
    expect((await h.app.inject({ method: 'GET', url: '/api/protocol/trpc/account.get' })).statusCode).toBe(200);
  });
});

describe('emissions off: the mint fails closed', () => {
  /**
   * `svc-token/src/env.ts` states the reason this switch must fail closed
   * rather than degrade: "inflation cannot be un-minted". A mint that is refused
   * can be retried; a mint that happened cannot be taken back.
   */
  it('refuses a mint once token is halted', async () => {
    const h = await edge();
    await flip(h, 'token', true, 'emission curve under review, stop minting');

    const res = await h.app.inject({ method: 'POST', url: '/api/token/trpc/emissions.mintEpoch' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'edge.module_killed', module: 'token' });
    expect(h.reached).toEqual([]);
  });

  it('never answers a refused mint with a success', async () => {
    const h = await edge();
    await flip(h, 'token', true, 'emission curve under review, stop minting');

    for (const url of ['/api/token/trpc/emissions.mintEpoch', '/api/token/internal/emissions/mint-next']) {
      const res = await h.app.inject({ method: 'POST', url });
      expect(res.statusCode, url).toBeGreaterThanOrEqual(500);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fail closed
// ─────────────────────────────────────────────────────────────────────────────

describe('an errored switch check behaves as ENGAGED', () => {
  /**
   * The one bug that makes a safety control worse than not having it. If the
   * check throws and the request is let through, the operator believes the
   * market is halted, the console says it is halted, and orders are being
   * accepted.
   */
  it('refuses every write when the switch itself throws', async () => {
    const app = Fastify({ logger: false });
    const reached: string[] = [];

    const broken = new KillSwitchState();
    // Stands in for a durable flag store that has lost its connection — the
    // realistic way this fails once the §13 socket is filled.
    broken.decide = () => {
      throw new Error('flag store unreachable');
    };

    registerKillSwitchGuard(app, broken);
    app.all('/api/*', async (req) => {
      reached.push(req.url);
      return { ok: true };
    });
    await app.ready();
    harness = { app, state: broken, reached };

    const res = await app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'edge.kill_switch_undecidable' });
    expect(reached).toEqual([]);
  });

  it('says WHY it refused, so a broken check is never mistaken for an operator halt', async () => {
    const h = await edge();
    await flip(h, 'trade', true, 'incident 2026-07-30, book quoting stale prices');

    const halted = await h.app.inject({ method: 'POST', url: '/api/v1/orders' });
    expect(halted.json().code).toBe('edge.module_killed');
    // The two call for completely different responses at 3am, so they must never
    // share a code.
    expect(halted.json().code).not.toBe('edge.kill_switch_undecidable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authorisation — an operator control any authenticated user can reach is not a control
// ─────────────────────────────────────────────────────────────────────────────

describe('who can actually reach the switch', () => {
  const WHY = 'incident 2026-07-30, book quoting stale prices';

  it('refuses an anonymous caller', async () => {
    const h = await edge();
    const res = await h.app.inject({ method: 'POST', url: '/admin/kill-switches', payload: { module: 'trade', disabled: true, reason: WHY } });
    expect(res.statusCode).toBe(401);
    expect(h.state.isKilled('trade')).toBe(false);
  });

  /** The property that matters most: a valid user session must not halt the exchange. */
  it('refuses an ordinary user session, however valid', async () => {
    const h = await edge();
    const res = await flip(h, 'trade', true, WHY, await asUser());
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'scope.denied' });
    expect(h.state.isKilled('trade')).toBe(false);
  });

  it('refuses an operator who has not passed a second factor', async () => {
    const h = await edge();
    const res = await flip(h, 'trade', true, WHY, await bearer(['admin:write'], false));
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'mfa.required' });
    expect(h.state.isKilled('trade')).toBe(false);
  });

  it('refuses a token signed with another key', async () => {
    const h = await edge();
    const { token } = await issueAccessToken(
      { userId: OPERATOR, sessionId: SESSION, scopes: ['admin:write'], mfa: true },
      { ...tokens, secret: 'a-completely-different-secret-that-is-long-enough' },
    );
    expect((await flip(h, 'trade', true, WHY, `Bearer ${token}`)).statusCode).toBe(401);
    expect(h.state.isKilled('trade')).toBe(false);
  });

  it('refuses a halt with no usable reason', async () => {
    const h = await edge();
    expect((await flip(h, 'trade', true, 'oops')).statusCode).toBe(400);
    expect(h.state.isKilled('trade')).toBe(false);
  });

  it('refuses a module that does not exist rather than inventing one', async () => {
    const h = await edge();
    expect((await flip(h, 'not-a-module', true, WHY)).statusCode).toBe(400);
  });

  /**
   * If halting `edge` could take the control plane down with it, the switch that
   * stopped the platform could not be used to restart it.
   */
  it('keeps the control plane reachable while modules are killed', async () => {
    const h = await edge();
    await flip(h, 'trade', true, WHY);
    await flip(h, 'identity', true, 'credential stuffing wave, close registration');

    const read = await h.app.inject({ method: 'GET', url: '/admin/kill-switches', headers: { authorization: await asOperator() } });
    expect(read.statusCode).toBe(200);
    expect(read.json().disabledModules).toEqual(['identity', 'trade']);

    // And the halt can still be lifted.
    expect((await flip(h, 'trade', false, 'feed recovered, resuming the market')).statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The audit trail
// ─────────────────────────────────────────────────────────────────────────────

describe('the audit trail, read back over HTTP', () => {
  it('names who pulled it, when, what, and what it was before', async () => {
    const h = await edge();
    await flip(h, 'trade', true, 'incident 2026-07-30, book quoting stale prices');

    const read = await h.app.inject({ method: 'GET', url: '/admin/kill-switches', headers: { authorization: await asOperator() } });
    const [entry] = read.json().audit;

    expect(entry).toMatchObject({
      module: 'trade',
      actor: OPERATOR, // WHO — from the token, never from the request body
      reason: 'incident 2026-07-30, book quoting stale prices', // WHAT, and why
      previous: false, // THE PRIOR STATE
      next: true,
      changed: true,
    });
    expect(Date.parse(entry.at)).not.toBeNaN(); // WHEN
  });

  it('records the resume as well as the halt, so an incident has an end', async () => {
    const h = await edge();
    await flip(h, 'trade', true, 'incident 2026-07-30, book quoting stale prices');
    await flip(h, 'trade', false, 'feed recovered, resuming the market');

    const read = await h.app.inject({ method: 'GET', url: '/admin/kill-switches', headers: { authorization: await asOperator() } });
    expect(read.json().audit.map((e: { next: boolean }) => e.next)).toEqual([false, true]);
  });

  it('does not record a halt that never happened', async () => {
    const h = await edge();
    await flip(h, 'trade', true, 'oops'); // refused: reason too short

    const read = await h.app.inject({ method: 'GET', url: '/admin/kill-switches', headers: { authorization: await asOperator() } });
    expect(read.json().audit).toEqual([]);
  });

  it('is operator-only — an incident timeline is not public', async () => {
    const h = await edge();
    expect((await h.app.inject({ method: 'GET', url: '/admin/kill-switches' })).statusCode).toBe(401);
    expect((await h.app.inject({ method: 'GET', url: '/admin/kill-switches', headers: { authorization: await asUser() } })).statusCode).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The money plane
// ─────────────────────────────────────────────────────────────────────────────

describe('the ledger freeze — the switch that halts all value movement', () => {
  const WHY = 'reconciliation mismatch on BTC, halting posting';

  /** A stub svc-ledger operator surface, recording what the edge sent it. */
  function stubLedger() {
    const calls: { path: string; bearer: string; body: unknown }[] = [];
    const call: LedgerOperatorCall = async (path, _method, bearerHeader, body) => {
      calls.push({ path, bearer: bearerHeader, body });
      return { status: 200, body: { frozen: path === '/operator/freeze', actor: OPERATOR } };
    };
    return { calls, call };
  }

  it('refuses admin:write — halting a market is not the authority to halt the money plane', async () => {
    const { calls, call } = stubLedger();
    const h = await edge(call);

    const res = await h.app.inject({
      method: 'POST',
      url: '/admin/ledger/freeze',
      headers: { authorization: await asOperator() },
      payload: { reason: WHY },
    });
    expect(res.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });

  it('accepts admin:treasury and forwards the operator OWN token', async () => {
    const { calls, call } = stubLedger();
    const h = await edge(call);
    const auth = await asTreasury();

    const res = await h.app.inject({ method: 'POST', url: '/admin/ledger/freeze', headers: { authorization: auth }, payload: { reason: WHY } });
    expect(res.statusCode).toBe(200);

    // svc-ledger writes `posting_freeze.actor` from ITS OWN verification of this
    // token, so the edge cannot cause a freeze attributed to anybody else.
    expect(calls).toEqual([{ path: '/operator/freeze', bearer: auth, body: { reason: WHY } }]);
  });

  it('refuses an unexplained freeze before it leaves the edge', async () => {
    const { calls, call } = stubLedger();
    const h = await edge(call);

    const res = await h.app.inject({
      method: 'POST',
      url: '/admin/ledger/freeze',
      headers: { authorization: await asTreasury() },
      payload: { reason: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  it('thaws, and carries no reason because a cleared freeze has none', async () => {
    const { calls, call } = stubLedger();
    const h = await edge(call);

    const res = await h.app.inject({ method: 'POST', url: '/admin/ledger/unfreeze', headers: { authorization: await asTreasury() } });
    expect(res.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({ path: '/operator/unfreeze', body: undefined });
  });

  it('is not a proxy — an unnamed action is a 404, not a pass-through', async () => {
    const { calls, call } = stubLedger();
    const h = await edge(call);

    const res = await h.app.inject({ method: 'POST', url: '/admin/ledger/post', headers: { authorization: await asTreasury() }, payload: {} });
    expect(res.statusCode).toBe(404);
    expect(calls).toEqual([]);
  });

  /**
   * An operator told the platform is halted when it is not is worse off than one
   * told nothing at all.
   */
  it('never turns an unreachable ledger into a success', async () => {
    const h = await edge(null);
    const res = await h.app.inject({
      method: 'POST',
      url: '/admin/ledger/freeze',
      headers: { authorization: await asTreasury() },
      payload: { reason: WHY },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'edge.ledger_unreachable' });
  });

  it('passes a failing ledger through with its own status', async () => {
    const failing: LedgerOperatorCall = async () => ({ status: 502, body: { code: 'edge.ledger_unavailable' } });
    const h = await edge(failing);

    const res = await h.app.inject({
      method: 'POST',
      url: '/admin/ledger/freeze',
      headers: { authorization: await asTreasury() },
      payload: { reason: WHY },
    });
    expect(res.statusCode).toBe(502);
  });
});
