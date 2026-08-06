/**
 * The payout bound — the MECHANISM, not the account choice.
 *
 * These tests prove three things: an unnamed source refuses to boot, a named
 * source that the profit recipe does not draw from refuses to boot, and a
 * payout larger than the named balance refuses instead of overdrawing.
 */
import { describe, expect, it } from 'vitest';
import { MemoryLedger, houseFees, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import {
  ProfitSourceConfigError,
  checkProfitBound,
  formatAccountRef,
  parseAccountRef,
  profitSourceFromConfig,
  recipeProfitFundingAccount,
} from './profit-source.js';

/**
 * The spelling of the account `futuresRealizeProfit` actually draws from,
 * derived rather than typed, so this suite cannot drift from the recipe either.
 */
const RECIPE_SPELLING = formatAccountRef(recipeProfitFundingAccount('USDT'));

describe('parseAccountRef', () => {
  it('parses ownerType:ownerId:kind', () => {
    expect(parseAccountRef('house:insurance-fund:available', 'USDT')).toEqual({
      ownerType: 'house',
      ownerId: 'insurance-fund',
      assetId: 'USDT',
      kind: 'available',
    });
  });

  it('keeps colons inside the owner id — `fees:trade` is one owner', () => {
    expect(parseAccountRef('house:fees:trade:available', 'USDT')).toEqual({
      ownerType: 'house',
      ownerId: 'fees:trade',
      assetId: 'USDT',
      kind: 'available',
    });
  });

  it('parses a trailing purpose', () => {
    expect(parseAccountRef('module:trade:futures-pnl:available:pool', 'USDT')).toEqual({
      ownerType: 'module',
      ownerId: 'trade:futures-pnl',
      assetId: 'USDT',
      kind: 'available',
      purpose: 'pool',
    });
  });

  it('refuses rather than guesses on a bad owner type, missing kind, or empty segment', () => {
    for (const bad of ['bank:fees:trade:available', 'house:fees:trade', 'house::available', 'house:fees:trade:available:a:b', '']) {
      expect(() => parseAccountRef(bad, 'USDT')).toThrow(ProfitSourceConfigError);
    }
  });

  it('round-trips through formatAccountRef', () => {
    for (const spelling of ['house:fees:trade:available', 'module:trade:pnl:available:pool', 'treasury:rail:sepa:available']) {
      expect(formatAccountRef(parseAccountRef(spelling, 'USDT'))).toBe(spelling);
    }
  });
});

describe('recipeProfitFundingAccount', () => {
  it('reads the funding leg off the recipe instead of restating it', () => {
    const derived = recipeProfitFundingAccount('USDT');
    const probe = recipes.futuresRealizeProfit({
      positionId: '00000000-0000-4000-8000-000000000000',
      userId: '00000000-0000-4000-8000-000000000000',
      assetId: 'USDT',
      amount: amt('1'),
      profitId: 'x',
    });
    const credit = probe.entries.find((e) => e.direction === 'credit')!;
    expect(derived).toEqual(credit.account);
  });
});

describe('profitSourceFromConfig — refuse to boot rather than default', () => {
  /** THE ADR: which account funds profit is an OWNER decision, so there is no default. */
  it('throws when unset, and says whose decision it is', () => {
    for (const unset of [undefined, '', '   ']) {
      expect(() => profitSourceFromConfig(unset)).toThrow(ProfitSourceConfigError);
    }
    try {
      profitSourceFromConfig('');
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as Error).message).toContain('TRADE_FUTURES_PROFIT_SOURCE');
      expect((err as Error).message).toContain('owner decision');
      expect((err as Error).message).toContain('no safe default');
    }
  });

  it('throws on an unparseable value at boot, not on the first profitable close', () => {
    expect(() => profitSourceFromConfig('not-an-account')).toThrow(ProfitSourceConfigError);
  });

  /**
   * Bounding one account while debiting another is not a bound — it reads like
   * a control and is not one. Naming a different pot needs a ledger recipe
   * change, which is an owner carve-out (DIRECTION §3).
   */
  it('throws when the named account is not the one the profit recipe draws from', () => {
    try {
      profitSourceFromConfig('house:insurance-fund:available');
      expect.unreachable('should have refused');
    } catch (err) {
      expect((err as Error).message).toContain('is not a bound');
      expect((err as Error).message).toContain('ledger recipe change');
      expect((err as Error).message).toContain('DIRECTION §3');
    }
  });

  it('accepts the account the recipe actually draws from, and reports the asset-specific ref', () => {
    const source = profitSourceFromConfig(RECIPE_SPELLING);
    expect(source.configured).toBe(RECIPE_SPELLING);
    expect(source.accountFor('USDT')).toEqual(houseFees('trade', 'USDT'));
    expect(source.accountFor('EUR').assetId).toBe('EUR');
  });
});

describe('checkProfitBound', () => {
  const USER = '11111111-1111-4111-8111-111111111111';

  async function fundedLedger(amount: string) {
    const ledger = new MemoryLedger();
    if (amount !== '0') {
      // Route value in through a real recipe so the pot's balance is a posted
      // fact, not a fixture. `futuresRealizeLoss` is how fees legitimately land
      // in the trade pot.
      await ledger.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt(amount), rail: 'test', railRef: `seed-${amount}` }));
      await ledger.post(
        recipes.futuresRealizeLoss({
          positionId: 'seed',
          userId: USER,
          assetId: 'USDT',
          fromMargin: 0n,
          fromInsurance: amt(amount),
          lossId: `seed-${amount}`,
        }),
      );
    }
    return ledger;
  }

  it('passes when the source covers the payout', async () => {
    const ledger = new MemoryLedger();
    const source = profitSourceFromConfig(RECIPE_SPELLING);
    const check = await checkProfitBound({
      source,
      assetId: 'USDT',
      amount: 0n,
      balance: (ref) => ledger.balance(ref),
    });
    expect(check.ok).toBe(true);
  });

  it('refuses when the payout exceeds the named balance, and names the account', async () => {
    const ledger = await fundedLedger('0');
    const source = profitSourceFromConfig(RECIPE_SPELLING);
    const check = await checkProfitBound({
      source,
      assetId: 'USDT',
      amount: amt('1'),
      balance: (ref) => ledger.balance(ref),
    });
    expect(check.ok).toBe(false);
    expect(check.available).toBe(0n);
    expect(check.reason).toContain(formatAccountRef(houseFees('trade', 'USDT')));
    expect(check.reason).toContain('refusing rather than overdrawing');
  });

  it('checks the balance of the SOURCE account, not the user being paid', async () => {
    const ledger = new MemoryLedger();
    // The user is rich; the profit source is empty. The bound is the source.
    await ledger.post(recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('1000'), rail: 'test', railRef: 'rich' }));
    expect((await ledger.balance(userAvailable(USER, 'USDT'))).amount).toBe(amt('1000'));

    const check = await checkProfitBound({
      source: profitSourceFromConfig(RECIPE_SPELLING),
      assetId: 'USDT',
      amount: amt('1'),
      balance: (ref) => ledger.balance(ref),
    });
    expect(check.ok).toBe(false);
  });
});
