/**
 * PTX-M26-R02 — follower allocation / instrument / loss caps.
 *
 * Leader (or platform) settings are recommendations only. Bind takes the
 * tighter number and the instrument intersection. A missing follower limit
 * refuses rather than inheriting the leader's. Leader values never raise
 * a follower cap.
 */

import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { CopyError } from './errors.js';
import type { CopyEnvelope } from './follows.js';

export type CopyLeaderLimitSettings = {
  readonly maxAllocation?: string | null;
  readonly permittedInstruments?: readonly string[] | null;
  readonly maxLoss?: string | null;
};

export type CopyFollowerLimitInput = {
  readonly maxAllocation?: string | null;
  readonly permittedInstruments?: readonly string[] | null;
  readonly maxLoss?: string | null;
};

export type BoundCopyFollowerLimits = {
  readonly maxAllocation: Amount;
  readonly permittedInstruments: readonly string[];
  readonly maxLoss: Amount | null;
};

function present(raw: string | null | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveCap(raw: string, axis: 'allocation' | 'loss', owner: 'follower' | 'leader'): Amount {
  let amount: Amount;
  try {
    amount = parseAmount(raw);
  } catch {
    throw new CopyError(`${owner} ${axis} limit must be a valid decimal amount`, 'trade.copy_envelope_invalid');
  }
  if (amount <= 0n) {
    throw new CopyError(`${owner} ${axis} limit must be strictly positive`, 'trade.copy_envelope_invalid');
  }
  return amount;
}

function requireFollowerAllocation(raw: string | null | undefined): Amount {
  const presentRaw = present(raw);
  if (!presentRaw) {
    throw new CopyError('Follower allocation limit is required — refuse rather than inherit a leader cap', 'trade.copy_limit_missing');
  }
  return parsePositiveCap(presentRaw, 'allocation', 'follower');
}

function requireFollowerInstruments(raw: readonly string[] | null | undefined): readonly string[] {
  const markets = (raw ?? []).map((m) => m.trim()).filter(Boolean);
  if (markets.length === 0) {
    throw new CopyError('Follower instrument universe is required — refuse rather than inherit a leader list', 'trade.copy_limit_missing');
  }
  return markets;
}

function parseOptionalLeaderCap(raw: string | null | undefined, axis: 'allocation' | 'loss'): Amount | undefined {
  const presentRaw = present(raw);
  if (!presentRaw) return undefined;
  return parsePositiveCap(presentRaw, axis, 'leader');
}

function parseOptionalLeaderInstruments(raw: readonly string[] | null | undefined): readonly string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  return raw.map((m) => m.trim()).filter(Boolean);
}

/**
 * Compose independent follower caps with optional leader recommendations.
 * Missing follower allocation/instruments always refuse. Follower maxLoss
 * refuses when the loss axis is in play (follower or leader supplied it).
 */
export function bindCopyFollowerLimits(input: {
  follower: CopyFollowerLimitInput;
  leader?: CopyLeaderLimitSettings | null;
}): BoundCopyFollowerLimits {
  const maxAllocation = requireFollowerAllocation(input.follower.maxAllocation);
  const permittedInstruments = requireFollowerInstruments(input.follower.permittedInstruments);

  const leader = input.leader ?? null;
  const leaderAllocation = leader ? parseOptionalLeaderCap(leader.maxAllocation, 'allocation') : undefined;
  const leaderInstruments = leader ? parseOptionalLeaderInstruments(leader.permittedInstruments) : undefined;
  const leaderLoss = leader ? parseOptionalLeaderCap(leader.maxLoss, 'loss') : undefined;

  const followerLossRaw = present(input.follower.maxLoss);
  const lossAxisRequired = followerLossRaw !== undefined || leaderLoss !== undefined;
  let maxLoss: Amount | null = null;
  if (lossAxisRequired) {
    if (!followerLossRaw) {
      throw new CopyError('Follower loss limit is required — refuse rather than inherit a leader cap', 'trade.copy_limit_missing');
    }
    maxLoss = parsePositiveCap(followerLossRaw, 'loss', 'follower');
  }

  let allocation = maxAllocation;
  if (leaderAllocation !== undefined && leaderAllocation < allocation) {
    allocation = leaderAllocation;
  }

  let instruments = permittedInstruments;
  if (leaderInstruments !== undefined) {
    const allowed = new Set(leaderInstruments);
    instruments = permittedInstruments.filter((m) => allowed.has(m));
    if (instruments.length === 0) {
      throw new CopyError(
        'Leader instrument universe cannot replace follower instruments — intersection is empty',
        'trade.copy_market_not_permitted',
      );
    }
  }

  if (maxLoss !== null && leaderLoss !== undefined && leaderLoss < maxLoss) {
    maxLoss = leaderLoss;
  }

  return {
    maxAllocation: allocation,
    permittedInstruments: instruments,
    maxLoss,
  };
}

export function followerLimitsFromEnvelope(envelope: CopyEnvelope): CopyFollowerLimitInput {
  return {
    maxAllocation: formatAmount(envelope.maxAggregateExposure),
    permittedInstruments: envelope.permittedMarkets,
    maxLoss: envelope.maxLoss !== undefined ? formatAmount(envelope.maxLoss) : undefined,
  };
}

export function envelopeWithBoundLimits(envelope: CopyEnvelope, bound: BoundCopyFollowerLimits): CopyEnvelope {
  const maxNotionalPerOrder = envelope.maxNotionalPerOrder > bound.maxAllocation ? bound.maxAllocation : envelope.maxNotionalPerOrder;
  return {
    ...envelope,
    permittedMarkets: bound.permittedInstruments,
    maxAggregateExposure: bound.maxAllocation,
    maxNotionalPerOrder,
    ...(bound.maxLoss !== null ? { maxLoss: bound.maxLoss } : {}),
  };
}

export function bindEnvelopeLimits(envelope: CopyEnvelope, leader?: CopyLeaderLimitSettings | null): CopyEnvelope {
  return envelopeWithBoundLimits(envelope, bindCopyFollowerLimits({ follower: followerLimitsFromEnvelope(envelope), leader }));
}
