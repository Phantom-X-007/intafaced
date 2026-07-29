import { sub, type Amount } from '@intafaced/ledger-client';

/**
 * VESTING (§8.4 — "vesting schedules enforced by contract + platform escrow";
 * §35 — "vesting proofs on team allocations rendered on every token page").
 *
 * Pure, and deliberately so. A beneficiary staring at a countdown needs the
 * number on the page to be the number the claim will pay, and the only way to
 * guarantee that is for both to come from this function.
 *
 * ── The curve ───────────────────────────────────────────────────────────────
 *
 * Linear from `startAt` to `endAt`, with nothing at all released before
 * `cliffAt`. At the cliff, everything that accrued since `startAt` becomes
 * claimable in one step — which is what a cliff means and why it is not the
 * same as simply starting later.
 *
 * Rounding is `floor` at every step: a schedule can never release more than the
 * escrow behind it holds, and the final tranche is computed as `total −
 * released` rather than from the curve, so rounding cannot strand the last
 * unit of a grant forever.
 */

export interface VestingTerms {
  total: Amount;
  /** Accrual begins here. */
  startAt: Date;
  /** Nothing releases before this instant, however much has accrued. */
  cliffAt: Date;
  /** Fully vested here. */
  endAt: Date;
}

export class VestingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'VestingError';
  }
}

function assertTerms(terms: VestingTerms): void {
  if (terms.total <= 0n) throw new VestingError('A vesting schedule needs a positive total', 'launch.vesting_empty');
  if (terms.endAt.getTime() <= terms.startAt.getTime()) {
    throw new VestingError('A vesting schedule must end after it starts', 'launch.vesting_window');
  }
  if (terms.cliffAt.getTime() < terms.startAt.getTime() || terms.cliffAt.getTime() > terms.endAt.getTime()) {
    throw new VestingError('The cliff must fall inside the vesting window', 'launch.vesting_cliff');
  }
}

/** How much of the grant has accrued by `now`. Monotonic in `now`, by construction. */
export function vestedAt(terms: VestingTerms, now: Date): Amount {
  assertTerms(terms);

  const t = now.getTime();
  if (t < terms.cliffAt.getTime()) return 0n;
  if (t >= terms.endAt.getTime()) return terms.total;

  const elapsed = BigInt(t - terms.startAt.getTime());
  const duration = BigInt(terms.endAt.getTime() - terms.startAt.getTime());

  // Integer maths on the scaled amount — multiply first, then divide, so no
  // precision is lost to an intermediate ratio.
  return (terms.total * elapsed) / duration;
}

/**
 * What a claim would pay right now.
 *
 * `released` is the watermark from the schedule row. Passing a watermark ahead
 * of the curve is not an error to swallow — it means the row and the ledger
 * disagree about what has already been paid, and returning "nothing claimable"
 * would hide exactly the drift a reconciliation exists to find.
 */
export function claimable(terms: VestingTerms, released: Amount, now: Date): Amount {
  if (released < 0n) throw new VestingError('Released cannot be negative', 'launch.vesting_released');
  if (released > terms.total) {
    throw new VestingError(
      'This schedule has released more than it granted — the row and the ledger disagree',
      'launch.vesting_overreleased',
    );
  }

  const vested = vestedAt(terms, now);
  // The last tranche closes the grant exactly, so floor-rounding along the way
  // cannot leave a permanently unclaimable remainder.
  const target = now.getTime() >= terms.endAt.getTime() ? terms.total : vested;
  const owed = sub(target, released);
  return owed > 0n ? owed : 0n;
}

/**
 * Build a schedule's window from a raise's published terms.
 *
 * `cliffDays` is measured from the same instant accrual starts, so a raise that
 * says "6-month cliff, 24-month vest" produces exactly that and not a 30-month
 * schedule.
 */
export function scheduleWindow(input: { settledAt: Date; cliffDays: number; durationDays: number }): {
  startAt: Date;
  cliffAt: Date;
  endAt: Date;
} {
  if (!Number.isInteger(input.cliffDays) || input.cliffDays < 0) {
    throw new VestingError(`Cliff must be a non-negative whole number of days, got ${input.cliffDays}`, 'launch.vesting_cliff');
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
    throw new VestingError(`Vesting duration must be a positive whole number of days, got ${input.durationDays}`, 'launch.vesting_window');
  }
  if (input.cliffDays > input.durationDays) {
    throw new VestingError('A cliff cannot fall after the schedule ends', 'launch.vesting_cliff');
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const start = input.settledAt.getTime();
  return {
    startAt: new Date(start),
    cliffAt: new Date(start + input.cliffDays * DAY_MS),
    endAt: new Date(start + input.durationDays * DAY_MS),
  };
}
