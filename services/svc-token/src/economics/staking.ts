/**
 * Staking — lock tiers, stake weight, access gates, fee discounts.
 *
 * §4.3 stakes: `(id, user_id, amount, tier enum[flex,m3,m12], multiplier, started_at,
 * unlocks_at, status)`. This module is the arithmetic behind those columns — the row is
 * written by the service, the numbers in it come from here.
 *
 * Every multiplier and discount is basis points (10000 = 1.0x). A multiplier is a rate
 * applied to money, and a rate stored as a float is a rate that disagrees with itself
 * across two machines. There is no float anywhere in this file.
 *
 * Two consumers, §4.3: other services call `token.stakeOf(userId)` to "gate launchpad
 * allocations, OTC access, premium lobbies, vendor slots" (`accessTierFor`), and the
 * `feeCharge` recipe checks the "published decay schedule" (`feeDiscountBps`).
 */

import { type Amount, ZERO, mulBps, parseAmount } from '@intafaced/ledger-client';

export type StakeTier = 'flex' | 'm3' | 'm12';

export interface StakeTierSpec {
  /** 0 means withdrawable at any moment. */
  readonly lockDays: number;
  readonly multiplierBps: number;
  readonly label: string;
}

/**
 * The multiplier prices illiquidity, nothing else. Flex earns 1.0x because it takes no
 * duration risk and can exit the moment yield disappoints; m12 earns 2.5x because that
 * stake is committed through a full market cycle. The ladder must stay strictly increasing —
 * a flat step means the longer lock is strictly worse and nobody takes it.
 *
 * 365 rather than 360 days for m12: users read "12 months" as a year, and a lock that
 * releases five days late is a support ticket every time.
 */
export const STAKE_TIERS: Readonly<Record<StakeTier, StakeTierSpec>> = {
  flex: { lockDays: 0, multiplierBps: 10_000, label: 'Flexible' },
  m3: { lockDays: 90, multiplierBps: 15_000, label: '3-Month Lock' },
  m12: { lockDays: 365, multiplierBps: 25_000, label: '12-Month Lock' },
};

const MS_PER_DAY = 86_400_000;

function specFor(tier: StakeTier): StakeTierSpec {
  const spec = STAKE_TIERS[tier];
  if (!spec) throw new RangeError(`Unknown stake tier "${tier}"`);
  return spec;
}

function assertValidDate(date: Date, label: string): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new RangeError(`${label} must be a valid Date`);
}

/**
 * When a lock releases, or null for flex — flex has no unlock date, and `stakes.unlocks_at`
 * is nullable for exactly that reason.
 *
 * A day is a fixed 86_400_000ms, deliberately. Calendar-month arithmetic would make a lock
 * started on 31 January release on a date that depends on the leap year, and DST would make
 * two locks of the same tier differ by an hour.
 */
export function unlockDate(tier: StakeTier, startedAt: Date): Date | null {
  const spec = specFor(tier);
  assertValidDate(startedAt, 'startedAt');
  if (spec.lockDays === 0) return null;
  return new Date(startedAt.getTime() + spec.lockDays * MS_PER_DAY);
}

/** Boundary-inclusive: at the exact unlock instant the stake is free. We do not hold funds one extra millisecond. */
export function isUnlocked(tier: StakeTier, startedAt: Date, now: Date): boolean {
  const unlocksAt = unlockDate(tier, startedAt);
  assertValidDate(now, 'now');
  if (unlocksAt === null) return true;
  return now.getTime() >= unlocksAt.getTime();
}

/**
 * Stake scaled by its tier multiplier — the weight used for real-yield distribution (§4.3)
 * and governance vote weight.
 *
 * Rounds `floor`: weight converts directly into a claim on the yield pool, so rounding up
 * would hand a fraction of someone else's share to whoever staked an awkward number.
 */
export function stakeWeight(amount: Amount, tier: StakeTier): Amount {
  const spec = specFor(tier);
  if (amount < ZERO) throw new RangeError('Stake amount must not be negative');
  return mulBps(amount, spec.multiplierBps, 'floor');
}

export interface AccessTier {
  readonly name: string;
  readonly minStake: Amount;
  /** 0 = no launchpad allocation; higher tiers get earlier windows and larger caps. */
  readonly launchpadAllocationTier: number;
  readonly otcAccess: boolean;
  readonly premiumLobbies: boolean;
  /** Concurrent marketplace vendor listings this tier may hold open. */
  readonly vendorSlots: number;
}

/**
 * Ordered ascending by `minStake`; `accessTierFor` depends on that order. The first entry
 * has `minStake: 0` so every user — including one who has never staked — resolves to a real
 * tier and no caller ever has to handle a null.
 *
 * OTC opens at Operator because §5.2 puts OTC behind a staked-tier gate and OTC fills post
 * directly to the ledger with spread to house; it is not a surface to open to a drive-by.
 */
export const ACCESS_TIERS: readonly AccessTier[] = [
  { name: 'Base', minStake: parseAmount('0'), launchpadAllocationTier: 0, otcAccess: false, premiumLobbies: false, vendorSlots: 0 },
  { name: 'Initiate', minStake: parseAmount('1000'), launchpadAllocationTier: 1, otcAccess: false, premiumLobbies: false, vendorSlots: 1 },
  { name: 'Operator', minStake: parseAmount('10000'), launchpadAllocationTier: 2, otcAccess: true, premiumLobbies: true, vendorSlots: 3 },
  {
    name: 'Architect',
    minStake: parseAmount('100000'),
    launchpadAllocationTier: 3,
    otcAccess: true,
    premiumLobbies: true,
    vendorSlots: 10,
  },
  {
    name: 'Sovereign',
    minStake: parseAmount('1000000'),
    launchpadAllocationTier: 4,
    otcAccess: true,
    premiumLobbies: true,
    vendorSlots: 50,
  },
];

/** Highest tier whose threshold the stake meets. Thresholds are inclusive — staking exactly 1,000 IFC is Initiate. */
export function accessTierFor(stakedAmount: Amount): AccessTier {
  if (stakedAmount < ZERO) throw new RangeError('Staked amount must not be negative');

  for (let i = ACCESS_TIERS.length - 1; i >= 0; i--) {
    const tier = ACCESS_TIERS[i];
    if (tier && stakedAmount >= tier.minStake) return tier;
  }
  // Unreachable while the first entry's threshold is 0; kept so a bad edit fails loudly.
  throw new RangeError('ACCESS_TIERS has no zero-threshold base tier');
}

export interface FeeDiscountStep {
  readonly minStake: Amount;
  readonly discountBps: number;
}

/**
 * §4.3: "`feeCharge` recipe checks payer's IFC balance + published decay schedule → discount
 * applied". Published means this table — the schedule is a parameter of the economy, not a
 * branch buried in the fee recipe.
 */
export const FEE_DISCOUNT_SCHEDULE: readonly FeeDiscountStep[] = [
  { minStake: parseAmount('0'), discountBps: 0 },
  { minStake: parseAmount('1000'), discountBps: 500 },
  { minStake: parseAmount('10000'), discountBps: 1_000 },
  { minStake: parseAmount('100000'), discountBps: 2_000 },
  { minStake: parseAmount('1000000'), discountBps: 3_500 },
];

/**
 * Policy ceiling on any fee discount.
 *
 * 10000 bps is the arithmetic wall: at a 100% discount the fee is zero, and past it the fee
 * inverts — the house pays the user to trade, and a trading loop becomes a money printer
 * pointed at the fee account. 5000 is the policy ceiling, set well short of the wall so that
 * a governance edit to the schedule can be wrong by a factor of two and still only cost
 * revenue, never principal.
 */
export const MAX_FEE_DISCOUNT_BPS = 5_000;

/** Fee discount for a stake, in bps off the gross fee. Monotonically non-decreasing in stake, and always < 10000. */
export function feeDiscountBps(stakedAmount: Amount): number {
  if (stakedAmount < ZERO) throw new RangeError('Staked amount must not be negative');

  let discount = 0;
  for (const step of FEE_DISCOUNT_SCHEDULE) {
    if (stakedAmount >= step.minStake && step.discountBps > discount) discount = step.discountBps;
  }
  return Math.min(discount, MAX_FEE_DISCOUNT_BPS);
}
