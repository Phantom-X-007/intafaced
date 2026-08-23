import { parseAmount, recipes, rewardPay, rewardsEngine, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
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

export async function postPayouts(ledger: Pick<LedgerClient, 'post'>, input: PplnsInput): Promise<void> {
  const epoch = input.epoch;
  if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch < 0) throw new Error('mining.epoch_unset');
  await ledger.post(
    recipes.mintEmission({
      epoch,
      assetId: input.assetId,
      amount: parseAmount(input.reward),
      destination: rewardsEngine(input.assetId),
    }),
  );
  for (const recipe of buildPayoutRecipes(input)) await ledger.post(recipe);
}
