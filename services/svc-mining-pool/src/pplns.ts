import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';

export type PplnsShare = { shareId: string; minerId: string; weight: bigint };
export type PplnsInput = { windowId: string; epoch?: number; assetId: string; reward: string; feeBps: number; shares: PplnsShare[] };
export type Payout = { minerId: string; amount: string };
export type PplnsPlan = { windowId: string; assetId: string; gross: string; fee: string; net: string; retained: string; payouts: Payout[] };

const BPS = 10_000n;
function positive(name: string, value: Amount): void {
  if (value <= 0n) throw new Error(`${name}_unconfigured`);
}

/** Pure PPLNS calculation. Amounts are decimal strings at the boundary and scaled bigint inside. */
export function planPplns(input: PplnsInput): PplnsPlan {
  if (!input.windowId || !input.assetId) throw new Error('window_unconfigured');
  if (!input.reward.trim()) throw new Error('reward_unconfigured');
  const gross = parseAmount(input.reward);
  positive('reward', gross);
  if (!Number.isInteger(input.feeBps) || input.feeBps < 0 || input.feeBps >= 10_000) throw new Error('fee_unconfigured');
  const shares = input.shares.filter((s) => s.weight > 0n);
  const totalWeight = shares.reduce((sum, s) => sum + s.weight, 0n);
  if (totalWeight <= 0n) throw new Error('shares_empty');
  const fee = (gross * BigInt(input.feeBps)) / BPS;
  const net = gross - fee;
  const byMiner = new Map<string, Amount>();
  for (const share of shares) byMiner.set(share.minerId, (byMiner.get(share.minerId) ?? 0n) + share.weight);
  const payouts: Payout[] = [];
  let paid = 0n;
  for (const [minerId, weight] of byMiner) {
    const amount = (net * weight) / totalWeight;
    paid += amount;
    if (amount > 0n) payouts.push({ minerId, amount: formatAmount(amount) });
  }
  return {
    windowId: input.windowId,
    assetId: input.assetId,
    gross: formatAmount(gross),
    fee: formatAmount(fee),
    net: formatAmount(net),
    retained: formatAmount(net - paid),
    payouts,
  };
}
