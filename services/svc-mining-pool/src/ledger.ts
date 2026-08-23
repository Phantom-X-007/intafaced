import { rewardPay, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import { parseAmount } from '@intafaced/ledger-client';
import { planPplns, type PplnsInput } from './pplns.js';

/** Builds ledger-client recipes only; the service never owns or computes balances. */
export function buildPayoutRecipes(input: PplnsInput): PostRequest[] {
  const plan = planPplns(input);
  return plan.payouts.map((payout) =>
    rewardPay({
      rewardId: `mining:pplns:${plan.windowId}:${payout.minerId}`,
      userId: payout.minerId,
      assetId: plan.assetId,
      amount: parseAmount(payout.amount),
      reason: 'mining.pplns.payout',
    }),
  );
}

export async function postPayouts(ledger: LedgerClient, input: PplnsInput): Promise<void> {
  for (const recipe of buildPayoutRecipes(input)) await ledger.post(recipe);
}
