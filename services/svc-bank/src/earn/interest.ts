import { div, mulBps, parseAmount, sum, type Amount } from '@intafaced/ledger-client';

/**
 * INTEREST — pure arithmetic, no I/O.
 *
 * Every rounding decision is explicit and every one of them rounds the same
 * way: DOWN, in the reserve's favour. A cent invented by rounding up has to
 * come out of somewhere, and the only "somewhere" available is a pool reserve
 * funded for a smaller number — so an up-rounding bug does not show up as a
 * wrong figure, it shows up months later as a pool that cannot pay.
 */

/** Simple daily accrual. §8.1 specifies interest as a daily recipe. */
export const DAYS_PER_YEAR = 365;

const DAYS_PER_YEAR_SCALED: Amount = parseAmount(String(DAYS_PER_YEAR));

/**
 * One day of simple interest on a principal at an annual rate.
 *
 * Simple, not compounding: the yield is paid to the user's AVAILABLE balance,
 * not added to the position's principal. That is a deliberate product decision
 * and a doctrinal one at once — compounding would mean writing a new principal
 * figure every day, and a money column that changes daily is a running total
 * wearing a different name.
 */
export function dailyInterest(principal: Amount, aprBps: number, daysPerYear = DAYS_PER_YEAR): Amount {
  if (principal <= 0n) return 0n;
  if (!Number.isInteger(aprBps) || aprBps < 0) throw new RangeError(`APR must be a non-negative integer in bps, got ${aprBps}`);
  if (aprBps === 0) return 0n;

  const annual = mulBps(principal, aprBps, 'floor');
  const perDay = daysPerYear === DAYS_PER_YEAR ? DAYS_PER_YEAR_SCALED : parseAmount(String(daysPerYear));
  return div(annual, perDay, 'floor');
}

export interface AccruingPosition {
  positionId: string;
  userId: string;
  principal: Amount;
}

export interface AccrualPlan {
  /** One payout per USER, not per position — a user with three positions gets one credit. */
  readonly payouts: ReadonlyArray<{ userId: string; amount: Amount }>;
  readonly total: Amount;
  /** Positions whose day's interest rounded to nothing. Counted, not silently dropped. */
  readonly dust: number;
}

/**
 * A day's accrual for one pool.
 *
 * Payouts are aggregated per user before they become ledger entries. Two
 * entries against the same account in one transaction are legal, but one credit
 * per user makes a statement readable and makes the entry count a function of
 * users rather than of how many times someone happened to top up.
 *
 * A position whose daily interest floors to zero is skipped: the ledger rejects
 * zero-amount entries by design (a movement of nothing is not a movement), and
 * failing an entire pool's accrual because one dust position earned nothing
 * would be the wrong trade.
 */
export function planAccrual(positions: readonly AccruingPosition[], aprBps: number, daysPerYear = DAYS_PER_YEAR): AccrualPlan {
  const perUser = new Map<string, Amount>();
  let dust = 0;

  for (const position of positions) {
    const interest = dailyInterest(position.principal, aprBps, daysPerYear);
    if (interest <= 0n) {
      dust++;
      continue;
    }
    perUser.set(position.userId, (perUser.get(position.userId) ?? 0n) + interest);
  }

  // Deterministic order: the ledger transaction's entry list — and therefore its
  // hash — must not depend on Map iteration order surviving a refactor.
  const payouts = [...perUser.entries()]
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  return { payouts, total: sum(payouts.map((p) => p.amount)), dust };
}

/** `YYYY-MM-DD` in UTC — the accrual day, and half of the idempotency key. */
export function accrualDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}
