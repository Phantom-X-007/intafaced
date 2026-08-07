/**
 * Copy observation → scoped mirror plan (D-S-03 §2).
 *
 * No discretion: we either mirror within the follower's envelope or refuse
 * with a typed reason. Never resize, never invent a fill, never silently drop.
 * Session-key enforcement is on-chain; this is the service-side honesty gate.
 */

import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { CopyError } from './errors.js';
import type { CopyFollow } from './follows.js';

export type MirrorSide = 'buy' | 'sell';

export interface LeaderFillObservation {
  readonly leaderId: string;
  readonly marketId: string;
  readonly side: MirrorSide;
  readonly qty: Amount;
  readonly notional: Amount;
  readonly observedAt: Date;
}

export interface MirrorPlan {
  readonly followId: string;
  readonly followerId: string;
  readonly leaderId: string;
  readonly marketId: string;
  readonly side: MirrorSide;
  readonly qty: Amount;
  readonly notional: Amount;
  readonly reason: 'within_envelope';
}

export interface PresentMirrorPlan {
  readonly followId: string;
  readonly followerId: string;
  readonly leaderId: string;
  readonly marketId: string;
  readonly side: MirrorSide;
  readonly qty: string;
  readonly notional: string;
  readonly reason: 'within_envelope';
}

/**
 * Build a mirror plan for one follow against one leader fill.
 * Refuses (never invents) when caps / market / expiry fail.
 */
export function planMirror(input: {
  follow: CopyFollow;
  observation: LeaderFillObservation;
  /** Current aggregate exposure already open for this follow. */
  currentExposure: Amount;
  now: Date;
}): MirrorPlan {
  const { follow, observation } = input;

  if (follow.leaderId !== observation.leaderId) {
    throw new CopyError('Observation leader does not match follow', 'trade.copy_envelope_invalid');
  }

  if (input.now.getTime() >= follow.envelope.expiresAt.getTime()) {
    throw new CopyError('Copy session envelope expired — refuse rather than invent', 'trade.copy_key_expired');
  }

  if (!follow.envelope.permittedMarkets.includes(observation.marketId)) {
    throw new CopyError(`Market ${observation.marketId} is outside the follower envelope`, 'trade.copy_market_not_permitted');
  }

  if (observation.qty <= 0n || observation.notional <= 0n) {
    throw new CopyError('Leader fill qty/notional must be strictly positive', 'trade.copy_envelope_invalid');
  }

  if (observation.notional > follow.envelope.maxNotionalPerOrder) {
    throw new CopyError(
      `Mirror notional ${formatAmount(observation.notional)} exceeds per-order cap ${formatAmount(follow.envelope.maxNotionalPerOrder)}`,
      'trade.copy_cap_exceeded',
    );
  }

  const nextExposure = input.currentExposure + observation.notional;
  if (nextExposure > follow.envelope.maxAggregateExposure) {
    throw new CopyError(
      `Mirror would exceed aggregate exposure cap ${formatAmount(follow.envelope.maxAggregateExposure)}`,
      'trade.copy_cap_exceeded',
    );
  }

  return {
    followId: follow.followId,
    followerId: follow.followerId,
    leaderId: follow.leaderId,
    marketId: observation.marketId,
    side: observation.side,
    qty: observation.qty,
    notional: observation.notional,
    reason: 'within_envelope',
  };
}

export function parseLeaderFillObservation(input: {
  leaderId: string;
  marketId: string;
  side: MirrorSide;
  qty: string;
  notional: string;
  observedAt?: Date;
}): LeaderFillObservation {
  if (input.side !== 'buy' && input.side !== 'sell') {
    throw new CopyError('Mirror side must be buy|sell', 'trade.copy_envelope_invalid');
  }
  const marketId = input.marketId.trim();
  if (!marketId) {
    throw new CopyError('Market id required', 'trade.copy_envelope_invalid');
  }
  let qty: Amount;
  let notional: Amount;
  try {
    qty = parseAmount(input.qty);
    notional = parseAmount(input.notional);
  } catch {
    throw new CopyError('Leader fill amounts must be valid decimals', 'trade.copy_envelope_invalid');
  }
  return {
    leaderId: input.leaderId.trim(),
    marketId,
    side: input.side,
    qty,
    notional,
    observedAt: input.observedAt ?? new Date(),
  };
}

export function presentMirrorPlan(plan: MirrorPlan): PresentMirrorPlan {
  return {
    followId: plan.followId,
    followerId: plan.followerId,
    leaderId: plan.leaderId,
    marketId: plan.marketId,
    side: plan.side,
    qty: formatAmount(plan.qty),
    notional: formatAmount(plan.notional),
    reason: plan.reason,
  };
}

/** Explicit ban — never rank leaders by returns (SPEC §4). */
export function refuseCopyLeaderRanking(): never {
  throw new CopyError(
    'Returns-ranked leaderboards are forbidden under SPEC-SOVEREIGN §4 — searchable verified history only',
    'trade.copy_ranking_forbidden',
  );
}
