import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  config,
  deposit,
  expectOk,
  mutate,
  operatorToken,
  query,
  register,
  requireFleet,
  runId,
  seedMarket,
  verifyToBasic,
  type SeededMarket,
  type TestUser,
} from './harness.js';

/**
 * §14.6 — THE KILL-SWITCH, PULLED.
 *
 * A kill-switch nobody has ever pulled is not a kill-switch, and an endpoint
 * that returns 200 is not a kill-switch either. This test asserts on BEHAVIOUR:
 * an order that succeeds, then the switch, then the same order refused, then a
 * cancel that still works, then the switch back and the order succeeding again.
 *
 * ── It is driven through `apps/admin`, not through `svc-edge` ───────────────
 *
 * The DoD item is "kill-switch verified reachable FROM apps/admin". A test that
 * called the edge's control plane directly would prove the edge works and prove
 * nothing about the console — which is precisely the gap this branch found:
 * `svc-protocol` and `svc-indexer` both export a `set…Enabled()` "surface
 * `apps/admin` reaches", and nothing had ever reached either.
 *
 * So every toggle below goes to `POST http://localhost:3100/api/kill-switch` —
 * the running operator console, on the port an operator opens in a browser —
 * and the assertions are made against the platform on the other side of it.
 */

const run = runId();
const adminUrl = config.adminUrl;

let operator: string;
let trader: TestUser;
let market: SeededMarket;
let restingOrderId: string;

interface ConsoleResponse {
  ok?: boolean;
  status?: string;
  detail?: string | null;
  snapshot?: { disabledModules?: string[]; reasons?: Record<string, string> };
  disabledModules?: string[];
}

async function consoleGet(): Promise<{ status: number; body: ConsoleResponse }> {
  const res = await fetch(`${adminUrl}/api/kill-switch`, { signal: AbortSignal.timeout(10_000) });
  return { status: res.status, body: (await res.json()) as ConsoleResponse };
}

async function consoleSet(module: string, disabled: boolean, reason: string): Promise<{ status: number; body: ConsoleResponse }> {
  const res = await fetch(`${adminUrl}/api/kill-switch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ module, disabled, reason }),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, body: (await res.json()) as ConsoleResponse };
}

const placeOrder = (clientOrderId: string) =>
  mutate<{ id: string; status: string }>(
    '/api/trade/trpc/orders.create',
    { symbol: market.symbol, side: 'buy', type: 'limit', qty: '1', price: '100', clientOrderId },
    trader.accessToken,
  );

beforeAll(async () => {
  await requireFleet();

  const operatorUser = await register('ksop', run);
  operator = await operatorToken(operatorUser.userId, ['admin:compliance', 'admin:treasury', 'admin:read']);

  trader = await register('kstr', run);
  await verifyToBasic(trader, operator);

  market = await seedMarket(run);
  await deposit(operator, trader.userId, market.quote, '1000');

  // Start from a known state. A previous run that failed mid-way must not make
  // this one pass for the wrong reason.
  await consoleSet('trade', false, 'e2e setup: start from a live market');
});

afterAll(async () => {
  // Leave the fleet as we found it, whatever happened above. A test suite that
  // can leave the platform switched off is a worse outage than the bug it was
  // looking for.
  await consoleSet('trade', false, 'e2e teardown: restore the market').catch(() => undefined);
});

describe('[e2e:killswitch.trade-orders] the operator console can stop the exchange', () => {
  it('the console reports it can reach the control plane', async () => {
    const { status, body } = await consoleGet();
    // If this fails with `unconfigured`, ADMIN_OPERATOR_TOKEN is not set on the
    // admin app — the console is honest about that rather than rendering dead
    // switches, and the test says so rather than timing out later.
    expect(body.status, `admin console control plane: ${body.detail ?? ''}`).toBe('reachable');
    expect(status).toBe(200);
  });

  it('places an order before the switch, so the "after" means something', async () => {
    const order = expectOk(await placeOrder(`ks-pre-${run}`), 'order before the kill');
    expect(order.status).toBe('open');
    restingOrderId = order.id;
  });

  it('kills the trade module from the console', async () => {
    const { status, body } = await consoleSet('trade', true, `e2e ${run}: proving the switch changes behaviour`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.snapshot?.disabledModules).toContain('trade');
  });

  it('REFUSES A NEW ORDER — the behaviour, not the endpoint', async () => {
    const refused = await placeOrder(`ks-post-${run}`);
    expect(refused.data).toBeUndefined();
    expect(refused.status).toBe(503);
    expect(JSON.stringify(refused.raw)).toContain('edge.module_killed');
  });

  /**
   * §14's own worked example, and the half that makes it a safety control
   * rather than a trap: "`trade.spot` disabled refuses new orders while still
   * allowing cancels."
   */
  it('still lets a user cancel the order they already had', async () => {
    const cancelled = expectOk(
      await mutate<{ status: string }>('/api/trade/trpc/orders.cancel', { orderId: restingOrderId }, trader.accessToken),
      'cancel while killed',
    );
    expect(cancelled.status).toBe('cancelled');
  });

  it('still serves reads, so a user can see what they hold', async () => {
    const markets = await query('/api/trade/trpc/markets.list');
    expect(markets.status).toBe(200);

    const open = await query('/api/trade/trpc/orders.open', undefined, trader.accessToken);
    expect(open.status).toBe(200);
  });

  it('does not touch any other module', async () => {
    // The switch is per module. Identity must keep working, or an operator
    // killing one market has locked everybody out of the platform.
    const login = await mutate('/api/identity/trpc/auth.login', { identifier: trader.handle, password: trader.password });
    expect(login.status).toBe(200);
  });

  it('brings the module back, and orders work again', async () => {
    const { status, body } = await consoleSet('trade', false, `e2e ${run}: restoring the market after the proof`);
    expect(status).toBe(200);
    expect(body.snapshot?.disabledModules ?? []).not.toContain('trade');

    const order = expectOk(await placeOrder(`ks-after-${run}`), 'order after the switch came back');
    expect(order.status).toBe('open');

    // Tidy up the order this test just opened.
    await mutate('/api/trade/trpc/orders.cancel', { orderId: order.id }, trader.accessToken);
  });

  it('refuses a toggle with no usable reason', async () => {
    // Friction proportional to blast radius, enforced on the server. A switch
    // with no recorded reason is an outage nobody can explain afterwards.
    const { status } = await consoleSet('trade', true, 'oops');
    expect(status).toBe(400);
  });
});
