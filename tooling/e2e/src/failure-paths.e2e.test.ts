import { beforeAll, describe, expect, it } from 'vitest';
import {
  balance,
  deposit,
  expectOk,
  haltMarket,
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
 * §14.3 — THE TOP THREE FAILURE PATHS.
 *
 * Chosen because they are the three that cost real money when they go wrong,
 * not because they are the three that are easy to write:
 *
 *   1. **Insufficient funds.** The failure that must never partially succeed.
 *      A hold taken and not released is a user's balance gone.
 *   2. **A halted market.** The operator's own control. If a halt can be
 *      traded through, it is decoration; if a halt also blocks cancels, it is
 *      a trap.
 *   3. **An unauthenticated or under-scoped caller.** The one that decides
 *      whether anything else in this list matters.
 *
 * Every one of them asserts on WHAT DID NOT HAPPEN as well as on the status
 * code. A refusal that returns 400 and still moved value is the worst outcome
 * on this list, and only the balance assertion can see it.
 */

const run = runId();

let operator: string;
let poor: TestUser;
let rich: TestUser;
let market: SeededMarket;
let halted: SeededMarket;

beforeAll(async () => {
  await requireFleet();

  const operatorUser = await register('f0op', run);
  operator = await operatorToken(operatorUser.userId, ['admin:compliance', 'admin:treasury', 'admin:read']);

  poor = await register('f0poor', run);
  rich = await register('f0rich', run);
  await verifyToBasic(poor, operator);
  await verifyToBasic(rich, operator);

  market = await seedMarket(`${run}a`);
  halted = await seedMarket(`${run}b`);

  // The rich user funds the halted-market test; the poor user is funded with
  // a deliberately inadequate amount rather than nothing at all, so the test
  // exercises "not enough" rather than "no account".
  await deposit(operator, poor.userId, market.quote, '5');
  await deposit(operator, rich.userId, halted.quote, '500');
});

describe('[e2e:failure.insufficient-funds] a buy larger than the balance', () => {
  it('is refused, and the refusal is not retryable', async () => {
    const result = await mutate(
      '/api/trade/trpc/orders.create',
      { symbol: market.symbol, side: 'buy', type: 'limit', qty: '1', price: '100', clientOrderId: `poor-${run}` },
      poor.accessToken,
    );

    expect(result.data).toBeUndefined();
    // BAD_REQUEST on purpose. svc-trade's router says so explicitly:
    // "`ledger.insufficient_funds` must NOT look retryable — retrying a
    // rejected hold just rejects it again."
    expect(result.error?.data?.httpStatus).toBe(400);
    expect(result.error?.message.toLowerCase()).toMatch(/insufficient|balance|funds/);
  });

  it('leaves the balance untouched — no hold survives a rejected order', async () => {
    // THE ASSERTION THAT MATTERS. A refusal that took the hold first and failed
    // afterwards would return the same status code as this one does.
    expect(await balance(poor, market.quote)).toBe('5');
  });

  it('opens no order', async () => {
    const open = expectOk(await query<unknown[]>('/api/trade/trpc/orders.open', undefined, poor.accessToken), 'orders.open');
    expect(open).toHaveLength(0);
  });
});

describe('[e2e:failure.market-halted] a market the operator has halted', () => {
  let restingOrderId: string;

  it('accepts an order while the market is still active', async () => {
    const order = expectOk(
      await mutate<{ id: string; status: string }>(
        '/api/trade/trpc/orders.create',
        { symbol: halted.symbol, side: 'buy', type: 'limit', qty: '1', price: '100', clientOrderId: `pre-${run}` },
        rich.accessToken,
      ),
      'order before halt',
    );
    expect(order.status).toBe('open');
    restingOrderId = order.id;
  });

  it('refuses a new order once halted, and holds nothing', async () => {
    await haltMarket(halted.symbol);

    const before = await balance(rich, halted.quote);
    const result = await mutate(
      '/api/trade/trpc/orders.create',
      { symbol: halted.symbol, side: 'buy', type: 'limit', qty: '1', price: '100', clientOrderId: `post-${run}` },
      rich.accessToken,
    );

    expect(result.data).toBeUndefined();
    expect(result.error?.data?.httpStatus).toBe(403);
    expect(await balance(rich, halted.quote)).toBe(before);
  });

  /**
   * The half of the rule that is easy to get wrong, and expensive.
   * `services/svc-trade/src/router.ts`: "An operator who has halted a market
   * must still let users out; a control that traps funds is not a safety
   * control."
   */
  it('still lets a user out of the halted market, and returns the hold', async () => {
    const cancelled = expectOk(
      await mutate<{ status: string }>('/api/trade/trpc/orders.cancel', { orderId: restingOrderId }, rich.accessToken),
      'cancel in a halted market',
    );
    expect(cancelled.status).toBe('cancelled');

    // The hold came back. A cancel that reports success and keeps the lock is
    // the same trap by a different route.
    expect(Number(await balance(rich, halted.quote))).toBe(500);
  });
});

describe('[e2e:failure.unauthorized] a caller who has not proved enough', () => {
  it('refuses an anonymous order', async () => {
    const result = await mutate('/api/trade/trpc/orders.create', {
      symbol: market.symbol,
      side: 'buy',
      type: 'limit',
      qty: '1',
      price: '100',
    });
    expect(result.data).toBeUndefined();
    expect(result.error?.data?.httpStatus).toBe(401);
  });

  it('refuses a forged token — and lands it as anonymous rather than as a 500', async () => {
    const forged = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJub3QtYS11c2VyIn0.not-a-real-signature';
    const result = await mutate(
      '/api/trade/trpc/orders.create',
      { symbol: market.symbol, side: 'buy', type: 'limit', qty: '1', price: '100' },
      forged,
    );
    expect(result.error?.data?.httpStatus).toBe(401);
  });

  /**
   * UNDER-SCOPED, not unauthenticated. This is a fully valid session belonging
   * to a real user — it simply does not carry `admin:treasury`, and no session
   * the platform issues ever does. If this ever returns 200, any logged-in user
   * can mint themselves a balance.
   */
  it('refuses a real user session on an operator-only procedure', async () => {
    const result = await mutate(
      '/api/pay/trpc/deposit.credit',
      { userId: poor.userId, assetId: market.quote, amount: '1000000', railId: 'card-sandbox', railRef: `evil-${run}` },
      poor.accessToken,
    );

    expect(result.data).toBeUndefined();
    expect([401, 403]).toContain(result.error?.data?.httpStatus);
    // And nothing was minted.
    expect(await balance(poor, market.quote)).toBe('5');
  });

  it('does not let a caller smuggle in their own principal header', async () => {
    // The edge strips `x-intafaced-*` unconditionally before it decides
    // anything. A caller who could set the principal would be every user.
    const res = await fetch(`${process.env.E2E_EDGE_URL ?? 'http://localhost:4000'}/api/trade/trpc/orders.create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-intafaced-principal': Buffer.from(JSON.stringify({ sub: poor.userId, scopes: ['admin:treasury'] })).toString('base64url'),
        'x-intafaced-region': 'US',
      },
      body: JSON.stringify({ symbol: market.symbol, side: 'buy', type: 'limit', qty: '1', price: '100' }),
    });
    expect(res.status).toBe(401);
  });
});
