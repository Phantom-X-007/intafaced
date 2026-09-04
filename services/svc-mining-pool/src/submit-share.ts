import type { Sql } from 'postgres';
import { planPplns, type PplnsInput, type PplnsPlan, type PplnsShare } from './pplns.js';
import { persistWindowShares, PG_UNAVAILABLE } from './window-store.js';

export function parsePplnsBody(raw: unknown): PplnsInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('mining.share_malformed');
  const v = raw as Record<string, unknown>;
  if (typeof v.windowId !== 'string' || !v.windowId) throw new Error('window_unconfigured');
  if (typeof v.assetId !== 'string' || !v.assetId) throw new Error('window_unconfigured');
  if (typeof v.reward === 'number') throw new Error('mining.amount_not_decimal');
  if (typeof v.reward !== 'string') throw new Error('reward_unconfigured');
  if (typeof v.feeBps !== 'number' || !Number.isInteger(v.feeBps)) throw new Error('fee_unconfigured');
  let epoch: number | undefined;
  if (v.epoch !== undefined && v.epoch !== null) {
    if (typeof v.epoch !== 'number' || !Number.isInteger(v.epoch) || v.epoch < 0) throw new Error('mining.epoch_unset');
    epoch = v.epoch;
  }
  if (!Array.isArray(v.shares)) throw new Error('shares_empty');
  const shares: PplnsShare[] = v.shares.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('mining.share_malformed');
    const sh = item as Record<string, unknown>;
    if (typeof sh.shareId !== 'string' || typeof sh.minerId !== 'string') throw new Error('mining.share_malformed');
    if (typeof sh.weight === 'number') throw new Error('mining.weight_not_integer');
    if (typeof sh.weight === 'bigint') return { shareId: sh.shareId, minerId: sh.minerId, weight: sh.weight };
    if (typeof sh.weight === 'string' && /^(0|[1-9]\d*)$/.test(sh.weight)) {
      return { shareId: sh.shareId, minerId: sh.minerId, weight: BigInt(sh.weight) };
    }
    throw new Error('mining.weight_not_integer');
  });
  return { windowId: v.windowId, epoch, assetId: v.assetId, reward: v.reward, feeBps: v.feeBps, shares };
}

/** Persist the share. Mint/rewardPay happens on the JobHost tick, not this door. */
export async function submitShare(sql: Sql, input: PplnsInput): Promise<PplnsPlan> {
  if (!sql) throw new Error(PG_UNAVAILABLE);
  const plan = planPplns(input);
  await persistWindowShares(sql, input);
  return plan;
}
