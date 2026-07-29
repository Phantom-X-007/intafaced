import { beforeAll, describe, expect, it } from 'vitest';
import {
  balance,
  deposit,
  expectOk,
  mutate,
  operatorToken,
  query,
  register,
  requireFleet,
  runId,
  seedMarket,
  until,
  verifyToBasic,
  type SeededMarket,
  type TestUser,
} from './harness.js';

/**
 * §14.3 — THE HAPPY PATH: the money spine, end to end, through the front door.
 *
 *   register → verify → deposit → place → hold → fill → the ledger balances
 *
 * Every assertion is on a number the LEDGER produced. That is the whole point:
 * Doctrine §0.6 says no module holds its own balance, and the way that rule
 * fails in practice is not a module declaring a `balance` column — it is two
 * numbers that agree until the day they do not. This test buys and sells one
 * unit and then checks that the units and the fees add up on both sides.
 */

const run = runId();

let operator: string;
let maker: TestUser;
let taker: TestUser;
let market: SeededMarket;

/** One unit at 100 quote. Small enough to be exact, large enough to clear `min_notional`. */
const QTY = '1';
const PRICE = '100';
const NOTIONAL = 100;

beforeAll(async () => {
  await requireFleet();

  const operatorUser = await register('e2eop', run);
  operator = await operatorToken(operatorUser.userId, ['admin:compliance', 'admin:treasury', 'admin:read']);

  maker = await register('e2emk', run);
  taker = await register('e2etk', run);

  await verifyToBasic(maker, operator);
  await verifyToBasic(taker, operator);

  market = await seedMarket(run);
});

describe('[e2e:happy.money-spine] the money spine, through svc-edge', () => {
  it('registers a user the edge can authenticate', async () => {
    const me = await query<{ tier: string }>('/api/identity/trpc/kyc.status', undefined, maker.accessToken);
    expect(me.status).toBe(200);
    // Not `basic` by accident — the jurisdiction matrix refuses `trade` below it.
    expect(expectOk(me, 'kyc.status').tier).toBe('basic');
  });

  it('credits a deposit, and the ledger is the one that says so', async () => {
    await deposit(operator, maker.userId, market.base, '10');
    await deposit(operator, taker.userId, market.quote, '1000');

    expect(await balance(maker, market.base)).toBe('10');
    expect(await balance(taker, market.quote)).toBe('1000');
  });

  it('places a resting order and HOLDS exactly what it needs, no more', async () => {
    const order = expectOk(
      await mutate<{ id: string; status: string; holdAsset: string; holdAmount: string }>(
        '/api/trade/trpc/orders.create',
        { symbol: market.symbol, side: 'sell', type: 'limit', qty: QTY, price: PRICE, clientOrderId: `mk-${run}` },
        maker.accessToken,
      ),
      'maker sell',
    );

    expect(order.status).toBe('open');
    // A sell holds BASE, and holds the quantity exactly — not the notional, not
    // a rounded-up estimate. An over-hold is money a user cannot spend.
    expect(order.holdAsset).toBe(market.base);
    expect(Number(order.holdAmount)).toBe(Number(QTY));

    // And the hold is visible in the ledger as reduced availability.
    expect(Number(await balance(maker, market.base))).toBe(10 - Number(QTY));
  });

  it('crosses the book and fills both sides', async () => {
    const buy = expectOk(
      await mutate<{ id: string; status: string; filled: string; holdAsset: string; holdAmount: string }>(
        '/api/trade/trpc/orders.create',
        { symbol: market.symbol, side: 'buy', type: 'limit', qty: QTY, price: PRICE, clientOrderId: `tk-${run}` },
        taker.accessToken,
      ),
      'taker buy',
    );

    expect(buy.holdAsset).toBe(market.quote);
    expect(Number(buy.holdAmount)).toBe(NOTIONAL);

    const settled = await until(
      'the taker order to report filled',
      async () =>
        expectOk(
          await query<{ status: string; filled: string }>('/api/trade/trpc/orders.get', { orderId: buy.id }, taker.accessToken),
          'orders.get',
        ),
      (o) => o.status === 'filled',
    );
    expect(Number(settled.filled)).toBe(Number(QTY));

    const makerFills = expectOk(
      await query<Array<{ takerOrMaker: string }>>('/api/trade/trpc/fills.mine', { limit: 10 }, maker.accessToken),
      'fills.mine',
    );
    expect(makerFills.length).toBeGreaterThan(0);
    expect(makerFills[0]?.takerOrMaker).toBe('maker');
  });

  it('leaves the ledger balancing — units in, units out, fees accounted', async () => {
    /**
     * The arithmetic, spelled out rather than asserted as a magic constant,
     * because the point of the test is that these two numbers are derived from
     * the same fee schedule the platform charged:
     *
     *   maker sold 1 base at 100 → receives 100 quote, less 10 bps maker fee
     *   taker bought 1 base for 100 quote → receives 1 base, less 20 bps taker fee
     */
    const makerProceeds = NOTIONAL * (1 - market.makerBps / 10_000);
    const takerReceives = Number(QTY) * (1 - market.takerBps / 10_000);

    const makerQuote = await until(
      'the maker to be credited',
      () => balance(maker, market.quote),
      (value) => Number(value) > 0,
    );

    expect(Number(makerQuote)).toBeCloseTo(makerProceeds, 12);
    expect(Number(await balance(taker, market.base))).toBeCloseTo(takerReceives, 12);

    // Nothing left held: the maker sold the whole hold, the taker spent the
    // whole hold at exactly the limit price, so neither has a stranded lock.
    expect(Number(await balance(maker, market.base))).toBeCloseTo(10 - Number(QTY), 12);
    expect(Number(await balance(taker, market.quote))).toBeCloseTo(1000 - NOTIONAL, 12);

    // And the two sides moved the SAME units. If this ever fails, value was
    // created or destroyed between two accounts, which is the one thing a
    // double-entry ledger exists to make impossible.
    const baseOut = 10 - Number(await balance(maker, market.base));
    expect(baseOut).toBeCloseTo(Number(QTY), 12);
    expect(Number(await balance(taker, market.base))).toBeLessThanOrEqual(baseOut);
  });
});
