/**
 * Buyback, burn, and real-yield distribution.
 *
 * §4.3: "fixed `buyback_bps` of platform revenue per window → market-buy on internal book →
 * split to burn address account + rewards engine account. Structural, scheduled, logged in
 * `buyback_runs`." And: "weekly job aggregates house fee accounts per asset → distributes
 * pro-rata by stake × multiplier via `rewardPay` recipes. Real revenue, not emissions."
 *
 * This module computes the numbers those two jobs post. It never posts them — value moves
 * only through ledger recipes (Doctrine §0.6).
 *
 * The one rule that governs the whole file: a split of an Amount is derived, never rounded
 * twice. Round both sides independently and you either burn a wei that was never bought or
 * strand a wei in a run that reconciled "fine" 40,000 times before anyone noticed.
 */

import { type Amount, ZERO, mulBps, proRata, sub, sum } from '@intafaced/ledger-client';
import { type StakeTier, stakeWeight } from './staking.js';

export interface BuybackParams {
  /** Share of the window's platform revenue spent buying IFC. */
  readonly buybackBps: number;
  /** Share of the bought IFC sent to the burn address; the remainder funds the rewards engine. */
  readonly burnSplitBps: number;
}

/**
 * §20 targets a published fee → buyback percentage as a headline commitment. That published
 * number lives in `token_params`, set by governance; the default here is a deliberately
 * conservative 50% so that a value in source is never mistaken for the commitment itself.
 *
 * 60/40 burn-to-rewards: the burn is the permanent leg (supply that cannot come back) and
 * should dominate, but a flywheel that pays stakers nothing in the window they actually
 * carried the risk is a flywheel with no hand on it.
 */
export const DEFAULT_BUYBACK_PARAMS: BuybackParams = {
  buybackBps: 5_000,
  burnSplitBps: 6_000,
};

function assertBps(bps: number, label: string): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`${label} must be an integer in [0, 10000], got ${bps}`);
}

/**
 * Revenue to spend this window.
 *
 * Rounds `floor` — the opposite of `mulBps`'s fee-side default. This is the house spending
 * its own revenue: rounding up spends a unit that the window did not earn, and across
 * enough windows that is an overdraft on the revenue account.
 */
export function buybackBudget(revenue: Amount, params: BuybackParams = DEFAULT_BUYBACK_PARAMS): Amount {
  assertBps(params.buybackBps, 'buybackBps');
  if (revenue < ZERO) throw new RangeError('Revenue must not be negative — a loss window buys nothing, it does not sell');
  return mulBps(revenue, params.buybackBps, 'floor');
}

export interface BuybackSplit {
  readonly toBurn: Amount;
  readonly toRewards: Amount;
}

/**
 * Split bought tokens between the burn address and the rewards engine.
 *
 * `toBurn + toRewards === tokensBought` exactly, for every input, because only the burn leg
 * is computed and the rewards leg is what is left. The burn leg floors, so the residual wei
 * of any odd split lands in rewards — recoverable, unlike a wei sent to a burn address.
 */
export function splitBuyback(tokensBought: Amount, params: BuybackParams = DEFAULT_BUYBACK_PARAMS): BuybackSplit {
  assertBps(params.burnSplitBps, 'burnSplitBps');
  if (tokensBought < ZERO) throw new RangeError('Tokens bought must not be negative');

  const toBurn = mulBps(tokensBought, params.burnSplitBps, 'floor');
  return { toBurn, toRewards: sub(tokensBought, toBurn) };
}

export interface StakeSnapshot {
  readonly userId: string;
  readonly amount: Amount;
  readonly tier: StakeTier;
}

export interface YieldShare {
  readonly userId: string;
  readonly share: Amount;
}

/**
 * Real-yield distribution: split `totalYield` across stakes by stake × tier multiplier.
 *
 * `proRata` guarantees the shares sum to exactly `totalYield` by handing the dust out one
 * unit at a time — the `rewardPay` recipes posted from this must balance to the last wei
 * against the pool that funded them.
 *
 * Returns `[]` when there is nothing to split against (no stakes, or every stake zero). The
 * caller keeps the yield in the house account and rolls it into the next window; inventing
 * zero-value payouts would post `rewardPay` recipes that move nothing.
 *
 * Shares are positional per stake row, not per user: a user holding an m3 and an m12 stake
 * appears twice, which is correct — the tiers weigh differently and the stakes unlock
 * separately.
 */
export function distributeYield(totalYield: Amount, stakes: ReadonlyArray<StakeSnapshot>): YieldShare[] {
  if (totalYield < ZERO) throw new RangeError('Yield must not be negative — a loss is not distributed to stakers');
  if (stakes.length === 0) return [];

  const weights = stakes.map((stake) => stakeWeight(stake.amount, stake.tier));
  if (sum(weights) <= ZERO) return [];

  const shares = proRata(totalYield, weights);
  return stakes.map((stake, i) => ({ userId: stake.userId, share: shares[i] ?? ZERO }));
}
