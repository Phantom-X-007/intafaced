import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  houseFees,
  parseAmount as amt,
  recipes,
  rewardsEngine,
  userAvailable,
  type PostRequest,
} from '@intafaced/ledger-client';
import { RECIPE_REQUIRED_CODE, assertKnownRecipePost, unsampledRecipeNames } from './recipe-gate.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function toWire(req: PostRequest) {
  return {
    module: req.module,
    reason: req.reason,
    entries: req.entries.map((e) => ({
      account: e.account,
      direction: e.direction,
      amount: formatAmount(e.amount),
    })),
  };
}

describe('recipe-gate', () => {
  it('samples every registry recipe so the allowlist cannot silently drop one', () => {
    expect(unsampledRecipeNames()).toEqual([]);
  });

  it('accepts a deposit recipe post', () => {
    expect(() =>
      assertKnownRecipePost(
        toWire(
          recipes.deposit({
            userId: USER,
            assetId: 'USDT',
            amount: amt('10'),
            rail: 'crypto-native',
            railRef: 'tx-1',
          }),
        ),
      ),
    ).not.toThrow();
  });

  it('refuses assembled entries that are not a known recipe', () => {
    expect(() =>
      assertKnownRecipePost({
        module: 'evil',
        reason: 'second.book',
        entries: [
          { account: userAvailable(USER, 'USDT'), direction: 'credit' },
          { account: userAvailable(USER2, 'USDT'), direction: 'debit' },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: RECIPE_REQUIRED_CODE,
      }),
    );
  });

  it('refuses a stolen deposit.credited reason with user-to-user legs', () => {
    expect(() =>
      assertKnownRecipePost({
        module: 'ledger',
        reason: 'deposit.credited',
        entries: [
          { account: userAvailable(USER, 'USDT'), direction: 'credit' },
          { account: userAvailable(USER2, 'USDT'), direction: 'debit' },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: RECIPE_REQUIRED_CODE }));
  });

  it('refuses a two-leg trade.fill (the fill recipe is at least four legs)', () => {
    expect(() =>
      assertKnownRecipePost({
        module: 'trade',
        reason: 'trade.fill',
        entries: [
          { account: userAvailable(USER, 'USDT'), direction: 'debit' },
          { account: userAvailable(USER2, 'USDT'), direction: 'credit' },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: RECIPE_REQUIRED_CODE }));
  });

  it('accepts feeCharge with a caller-chosen reason', () => {
    expect(() =>
      assertKnownRecipePost(
        toWire(
          recipes.feeCharge({
            chargeId: 'c1',
            userId: USER,
            module: 'agents',
            mode: 'asset',
            assetId: 'USDT',
            amount: amt('1'),
            reason: 'agents.usage.metered',
          }),
        ),
      ),
    ).not.toThrow();
  });

  it('accepts rewardPay with a caller-chosen reason', () => {
    expect(() =>
      assertKnownRecipePost({
        module: 'token',
        reason: 'bank.card.cashback',
        entries: [
          { account: rewardsEngine('USDT'), direction: 'credit' },
          { account: userAvailable(USER, 'USDT'), direction: 'debit' },
        ],
      }),
    ).not.toThrow();
  });

  it('does not treat a house-fees credit as feeCharge', () => {
    expect(() =>
      assertKnownRecipePost({
        module: 'evil',
        reason: 'steal',
        entries: [
          { account: houseFees('trade', 'USDT'), direction: 'credit' },
          { account: userAvailable(USER, 'USDT'), direction: 'debit' },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: RECIPE_REQUIRED_CODE }));
  });
});
