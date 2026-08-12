import { recipes, type Amount, type PostRequest } from '@intafaced/ledger-client';

export type SettlementDestinationKind = 'bank' | 'crypto';

export interface SettlementLedgerInput {
  settlementId: string;
  payoutAttempt: number;
  merchantUserId: string;
  assetId: string;
  amount: Amount;
  railId: string;
  destinationKind: string;
}

export interface SettlementLedgerPlan {
  withdrawalId: string;
  destinationKind: SettlementDestinationKind;
  hold: PostRequest;
  settle: PostRequest;
  reverse: PostRequest;
}

/**
 * Builds the complete ledger side of a bank-or-crypto settlement payout.
 *
 * Both destinations have the same balance movement: merchant available → a
 * purpose-keyed hold → the selected rail boundary, or back to available if the
 * rail refuses. The rail adapter owns the bank/chain difference. Splitting that
 * movement into bank-specific and crypto-specific ledger entries would create
 * two books for one invariant, so this function may only compose the existing
 * ledger-client withdrawal recipes.
 */
export function settlementLedgerPlan(input: SettlementLedgerInput): SettlementLedgerPlan {
  if (input.destinationKind !== 'bank' && input.destinationKind !== 'crypto') {
    throw new Error(`Settlement destination kind '${input.destinationKind}' is unsupported — expected bank or crypto`);
  }

  const withdrawalId = `${input.settlementId}:${input.payoutAttempt}`;
  const withdrawal = {
    userId: input.merchantUserId,
    assetId: input.assetId,
    amount: input.amount,
    rail: input.railId,
    withdrawalId,
  };

  return {
    withdrawalId,
    destinationKind: input.destinationKind,
    hold: recipes.withdrawHold(withdrawal),
    settle: recipes.withdrawSettle(withdrawal),
    reverse: recipes.withdrawReverse(withdrawal),
  };
}
