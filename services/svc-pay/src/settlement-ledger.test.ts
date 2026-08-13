import { describe, expect, it } from 'vitest';
import { parseAmount, recipes } from '@intafaced/ledger-client';
import { settlementLedgerPlan, type SettlementDestinationKind } from './settlement-ledger.js';

const MERCHANT_USER = '11111111-1111-4111-8111-111111111111';

describe('settlementLedgerPlan', () => {
  it.each([
    { destinationKind: 'bank', railId: 'bank-payout' },
    { destinationKind: 'crypto', railId: 'crypto-native' },
  ] satisfies Array<{ destinationKind: SettlementDestinationKind; railId: string }>)(
    'uses only the shared withdrawal recipes for a $destinationKind payout',
    ({ destinationKind, railId }) => {
      const amount = parseAmount('98.75');
      const withdrawalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:2';
      const withdrawal = {
        userId: MERCHANT_USER,
        assetId: 'USDT',
        amount,
        rail: railId,
        withdrawalId,
      };

      const plan = settlementLedgerPlan({
        settlementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payoutAttempt: 2,
        merchantUserId: MERCHANT_USER,
        assetId: 'USDT',
        amount,
        railId,
        destinationKind,
      });

      expect(plan).toEqual({
        withdrawalId,
        destinationKind,
        hold: recipes.withdrawHold(withdrawal),
        settle: recipes.withdrawSettle(withdrawal),
        reverse: recipes.withdrawReverse(withdrawal),
      });
      expect([plan.hold.reason, plan.settle.reason, plan.reverse.reason]).toEqual([
        'withdraw.held',
        'withdraw.settled',
        'withdraw.reversed',
      ]);
      expect(plan.hold.idempotencyKey).toBe(`withdraw.hold:${withdrawalId}`);
      expect(plan.settle.idempotencyKey).toBe(`withdraw.settle:${withdrawalId}`);
      expect(plan.reverse.idempotencyKey).toBe(`withdraw.reverse:${withdrawalId}`);
    },
  );

  it('refuses to invent a third settlement destination kind', () => {
    expect(() =>
      settlementLedgerPlan({
        settlementId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        payoutAttempt: 0,
        merchantUserId: MERCHANT_USER,
        assetId: 'USDT',
        amount: parseAmount('1'),
        railId: 'some-future-rail',
        destinationKind: 'cash',
      }),
    ).toThrow(/expected bank or crypto/);
  });
});
