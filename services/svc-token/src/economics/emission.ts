/**
 * Emission — the IFC mint schedule.
 *
 * §4.3: "svc-token owns the emission schedule; svc-mining-pool (Phase 5) requests epoch
 * allocations — token service is the only minter." This module IS that schedule: pure
 * arithmetic over an epoch index. It does not know who is asking, what has actually been
 * minted, or whether an epoch closed. `emission_epochs` records what happened; these
 * functions state what was supposed to happen, so the two can be reconciled.
 *
 * A halving is a bigint right-shift, not a division by a float. Once the reward decays
 * past one unit (10^-18) the shift yields exactly `0n` — there is no long tail of
 * sub-precision dust that rounds back into existence somewhere downstream.
 */

import { type Amount, ZERO, min, parseAmount, sub } from '@intafaced/ledger-client';

export interface EmissionParams {
  /** Reward minted in epoch 0, before any halving. */
  readonly initialEpochReward: Amount;
  /** Epochs per halving era. Must be >= 1. */
  readonly halvingIntervalEpochs: number;
  /** Hard ceiling on everything this module will ever schedule. */
  readonly maxSupply: Amount;
}

/**
 * A SEED, NOT THE SCHEDULE THAT RUNS.
 *
 * `svc-token` boots with `loadParamsFromDb: true`, so `token.token_params` is the authority and
 * these constants are a fallback that a live deployment never reaches. Read them as a shape —
 * three fields of the right types — not as the economy. The two copies are held to each other
 * by the agreement test in `economics.test.ts`; that test is red today, deliberately, because
 * they disagree and only the owner may say which value wins (ADR
 * `docs/adr/2026-08-04-token-economics-outcomes.md`).
 *
 * TRUE OF BOTH COPIES: one epoch is one day, so a halving era of 1460 epochs is about four
 * years — long enough that a miner can plan capex against it, short enough that the curve is
 * not a promise to a generation. 1460 is the one emission number the seed and the live row
 * already agree on.
 *
 * TRUE OF THE LIVE ROW, AND NOT OF THIS SEED: a halving schedule sums to
 * `2 × initialEpochReward × halvingInterval`. The seeded row's 2500/epoch over 1460 epochs
 * gives a geometric limit of 7,300,000 IFC against a `total_supply` of 1,000,000,000, so the
 * live curve tops out at about 0.73% of the cap and the cap IS the entire supply rather than a
 * slice of it. The clamp in `cumulativeEmission` is therefore a backstop rather than the
 * mechanism the economy relies on — but by three orders of magnitude, not by the hair's breadth
 * these seed values imply.
 *
 * INTENT ON RECORD, NOT A STATED FACT: this comment used to assert that the cap was the mining
 * allocation — 40% of a 1,000,000,000 supply, the other 60% (treasury, liquidity, contributors)
 * allocated by governance and never minted here. That split appears NOWHERE else in the repo —
 * not in `INTAFACED_DEFINITIVE_BUILD.md`, not in the migration, not in any doc — and it is not
 * what the live row does. It is kept here as the intent it always was: an emission cap that is a
 * slice of the supply rather than the whole of it is a coherent design and someone meant it.
 * Whether it is the design, and at what ratio, is an undecided owner number on the ADR's
 * enumerated list. Until it is decided, nothing may describe the IFC supply as divided.
 */
export const DEFAULT_EMISSION_PARAMS: EmissionParams = {
  initialEpochReward: parseAmount('136000'),
  halvingIntervalEpochs: 1460,
  maxSupply: parseAmount('400000000'),
};

/**
 * Halvings a reward survives before it is exactly zero — i.e. its bit length. Bounds every
 * loop in this module to ~80 iterations regardless of how deep an epoch a caller asks for.
 */
function halvingsUntilZero(reward: Amount): number {
  return reward <= ZERO ? 0 : reward.toString(2).length;
}

function assertEpoch(epoch: number, label: string): void {
  if (!Number.isInteger(epoch) || epoch < 0) throw new RangeError(`${label} must be a non-negative integer epoch index, got ${epoch}`);
}

function assertParams(params: EmissionParams): void {
  if (!Number.isInteger(params.halvingIntervalEpochs) || params.halvingIntervalEpochs < 1) {
    throw new RangeError(`halvingIntervalEpochs must be a positive integer, got ${params.halvingIntervalEpochs}`);
  }
  if (params.initialEpochReward < ZERO) throw new RangeError('initialEpochReward must not be negative');
  if (params.maxSupply < ZERO) throw new RangeError('maxSupply must not be negative');
}

/** Which halving era an epoch falls in. Era 0 is the pre-halving era. */
function eraOf(epoch: number, params: EmissionParams): number {
  return Math.floor(epoch / params.halvingIntervalEpochs);
}

/**
 * Scheduled reward for a single epoch. Epochs are 0-indexed, so the first halving takes
 * effect at epoch `halvingIntervalEpochs` — the boundary epoch is the first of the NEW era,
 * not the last of the old one.
 */
export function epochReward(epoch: number, params: EmissionParams = DEFAULT_EMISSION_PARAMS): Amount {
  assertEpoch(epoch, 'epoch');
  assertParams(params);

  const era = eraOf(epoch, params);
  // Guard the shift itself: `1n >> 10_000_000n` is a valid but pointlessly expensive way
  // to compute zero, and callers do ask about absurd epochs.
  if (era >= halvingsUntilZero(params.initialEpochReward)) return ZERO;
  return params.initialEpochReward >> BigInt(era);
}

/**
 * Total scheduled through `throughEpoch`, inclusive.
 *
 * Summed per ERA, not per epoch: every epoch in an era pays the same reward, so an era is
 * one multiply. `cumulativeEmission(1_000_000)` costs the same ~80 iterations as
 * `cumulativeEmission(10_000)`.
 *
 * The result is CLAMPED to `maxSupply` rather than throwing. The cap is an invariant of the
 * mint path, not a validation error of the schedule: the mint posts `min(scheduled,
 * remaining)`, so a schedule that projects past the cap simply stops paying. Throwing would
 * turn every far-future query — a supply chart, a projection, a governance proposal preview —
 * into an error path, and would push cap arithmetic into every caller, which is exactly how
 * one caller ends up getting it wrong.
 */
export function cumulativeEmission(throughEpoch: number, params: EmissionParams = DEFAULT_EMISSION_PARAMS): Amount {
  assertEpoch(throughEpoch, 'throughEpoch');
  assertParams(params);

  const interval = params.halvingIntervalEpochs;
  const eras = halvingsUntilZero(params.initialEpochReward);
  let total = ZERO;

  for (let era = 0; era < eras; era++) {
    const eraStart = era * interval;
    if (eraStart > throughEpoch) break;

    const eraEnd = Math.min(eraStart + interval - 1, throughEpoch);
    total += (params.initialEpochReward >> BigInt(era)) * BigInt(eraEnd - eraStart + 1);
    if (total >= params.maxSupply) return params.maxSupply;
  }

  return min(total, params.maxSupply);
}

/** Headroom left under the cap. Never negative — `cumulativeEmission` is clamped. */
export function remainingSupply(throughEpoch: number, params: EmissionParams = DEFAULT_EMISSION_PARAMS): Amount {
  return sub(params.maxSupply, cumulativeEmission(throughEpoch, params));
}

/**
 * True when no future epoch can ever mint again — either the cap is consumed or the halvings
 * have decayed the reward to zero. Rewards are monotonically non-increasing, so a zero at
 * `throughEpoch + 1` is a zero forever.
 */
export function isExhausted(throughEpoch: number, params: EmissionParams = DEFAULT_EMISSION_PARAMS): boolean {
  return remainingSupply(throughEpoch, params) === ZERO || epochReward(throughEpoch + 1, params) === ZERO;
}

/**
 * Epochs from `epoch` until the reward next halves. At a boundary epoch the countdown has
 * just reset, so this returns a full interval rather than 0.
 *
 * Halving a reward that is already zero is a no-op, and this still returns the arithmetic
 * countdown — a UI rendering "next halving in N days" must check `isExhausted` first.
 */
export function epochsUntilHalving(epoch: number, params: EmissionParams = DEFAULT_EMISSION_PARAMS): number {
  assertEpoch(epoch, 'epoch');
  assertParams(params);
  return params.halvingIntervalEpochs - (epoch % params.halvingIntervalEpochs);
}
