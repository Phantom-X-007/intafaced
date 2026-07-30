import { div, formatAmount, mul, mulBps, parseAmount, sum, type Amount } from '@intafaced/ledger-client';

/**
 * LOAN RISK — pure arithmetic, no I/O, no clock, no database.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY NUMBER IN THIS FILE IS A BIGINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An LTV computed in floating point is a wrong liquidation price. Not "slightly
 * imprecise" — wrong, in a way that decides whether someone's collateral is
 * seized. `0.1 + 0.2 !== 0.3` is the same defect as a threshold comparison that
 * flips at the boundary, and the boundary is exactly where every liquidation
 * happens. So prices, values and ratios are all scaled integers, ratios are
 * integer basis points, and every division states its rounding.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH WAY EACH FIGURE ROUNDS, AND WHO PAYS FOR IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `earn/interest.ts` rounds everything DOWN because it is paying users out of a
 * finite reserve. This file has two different jobs and they round oppositely:
 *
 *   · RISK figures round AGAINST the platform's optimism. LTV rounds UP, debt
 *     value rounds UP, collateral value rounds DOWN. A book that under-reports
 *     risk by one unit is a book that learns about a bad loan one tick late, and
 *     one tick late is the whole cost of the event.
 *
 *   · CHARGES to the borrower round DOWN. Interest, and the seizure needed to
 *     restore a target LTV, both round in the borrower's favour. The platform
 *     forgoing a sub-attounit per day is not a business risk; systematically
 *     taking one from a leveraged borrower is the kind of thing that is only ever
 *     discovered by the borrower.
 *
 * Those two rules pull in opposite directions on purpose. The rule is not "round
 * conservatively"; it is "round so the mistake lands on whoever chose the risk".
 */

/** 100% in basis points. LTV, thresholds and penalties are all integer bps. */
export const BPS = 10_000;

/** §8.1 specifies interest as a DAILY recipe. 365, matching `earn/interest.ts`. */
export const DAYS_PER_YEAR = 365;

const DAYS_PER_YEAR_SCALED: Amount = parseAmount(String(DAYS_PER_YEAR));

// ── Valuation ────────────────────────────────────────────────────────────────

/**
 * A mark for one asset, in the loan's quote asset.
 *
 * `price` is scaled: how many units of the quote asset one unit of `assetId` is
 * worth. `asOf` is when the mark was taken, and it is not optional — a price
 * with no timestamp cannot be checked for staleness, and a stale price is the
 * cheapest way to liquidate someone who is not actually in trouble. See
 * `prices.ts` for the guards that consume it.
 */
export interface Mark {
  readonly assetId: string;
  readonly price: Amount;
  readonly asOf: Date;
}

export interface Holding {
  readonly assetId: string;
  readonly quantity: Amount;
}

export class RiskError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'RiskError';
  }
}

/**
 * Value a set of holdings at a set of marks.
 *
 * `rounding` is required rather than defaulted, because the caller is always
 * valuing either collateral (round down) or debt (round up) and there is no third
 * case where "whichever" is correct.
 */
export function valueAt(holdings: readonly Holding[], marks: ReadonlyMap<string, Mark>, rounding: 'floor' | 'ceil'): Amount {
  return sum(
    holdings.map((h) => {
      const mark = marks.get(h.assetId);
      if (!mark) {
        // Refused rather than skipped. A holding valued at zero because its mark
        // was missing reads as a borrower with no collateral, and the LTV that
        // follows says liquidate.
        throw new RiskError(`No mark for ${h.assetId} — cannot value a position with a missing price`, 'bank.mark_missing');
      }
      return mul(h.quantity, mark.price, rounding);
    }),
  );
}

// ── Loan-to-value ────────────────────────────────────────────────────────────

/**
 * LTV in integer basis points: what fraction of the collateral's value the debt
 * represents.
 *
 * Rounds UP. `7500.4` bps becomes 7501, so a loan on the boundary is treated as
 * over it. The alternative rounds a marginal position into safety, and marginal
 * positions are the only ones this number is ever consulted about.
 *
 * Zero collateral against real debt is not `Infinity` and not an error — it is a
 * position that is entirely unsecured, and the honest encoding is a ratio past
 * every threshold. Returning `Number.MAX_SAFE_INTEGER` keeps every comparison
 * downstream a plain integer comparison.
 */
export function ltvBps(debtValue: Amount, collateralValue: Amount): number {
  if (debtValue < 0n) throw new RiskError('Debt value cannot be negative', 'bank.risk_invalid');
  if (collateralValue < 0n) throw new RiskError('Collateral value cannot be negative', 'bank.risk_invalid');
  if (debtValue === 0n) return 0;
  if (collateralValue === 0n) return Number.MAX_SAFE_INTEGER;

  // Deliberately NOT `div()`. `div` returns a SCALED result, so rounding it up at
  // the 10^-18 place and then integer-dividing by the scale to get whole bps
  // floors the answer — the ceil is silently undone, and a loan at exactly the
  // liquidation threshold reads as one tick below it. This is the arithmetic the
  // whole file exists to get right, so it is spelled out.
  const numerator = debtValue * BigInt(BPS);
  const bps = (numerator + collateralValue - 1n) / collateralValue;
  return bps > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(bps);
}

/**
 * THE PORTFOLIO VIEW (§8.1: "portfolio-aware LTV job").
 *
 * A borrower's loans are marked together, not one at a time, and that is a
 * decision with a real trade-off rather than a convenience.
 *
 * FOR: collateral posted against loan A is genuinely the same borrower's, and a
 * borrower who is comfortably over-collateralised in aggregate is not in
 * distress. Liquidating them because one leg dipped is a loss inflicted for
 * bookkeeping reasons.
 *
 * AGAINST — and this is why the per-loan figure is returned as well: collateral
 * is locked per loan in the ledger (`loan:<id>`), so portfolio health does NOT
 * mean the platform can reach loan B's collateral to cover loan A. Aggregate LTV
 * is a fair warning signal; it is NOT sufficient authority to seize, and
 * `planLiquidation` only ever operates on one loan's own pot.
 *
 * Reporting both is what keeps those two facts from being confused.
 */
export interface LoanExposure {
  readonly loanId: string;
  readonly debtAssetId: string;
  /** Principal plus capitalised interest, as at the mark. */
  readonly debt: Amount;
  readonly collateralAssetId: string;
  readonly collateral: Amount;
}

export interface PortfolioMark {
  readonly debtValue: Amount;
  readonly collateralValue: Amount;
  readonly portfolioLtvBps: number;
  readonly loans: ReadonlyArray<{
    readonly loanId: string;
    readonly debtValue: Amount;
    readonly collateralValue: Amount;
    readonly ltvBps: number;
  }>;
}

export function markPortfolio(exposures: readonly LoanExposure[], marks: ReadonlyMap<string, Mark>): PortfolioMark {
  const loans = exposures.map((e) => {
    // Debt up, collateral down: the pessimistic reading of the same two prices.
    const debtValue = valueAt([{ assetId: e.debtAssetId, quantity: e.debt }], marks, 'ceil');
    const collateralValue = valueAt([{ assetId: e.collateralAssetId, quantity: e.collateral }], marks, 'floor');
    return { loanId: e.loanId, debtValue, collateralValue, ltvBps: ltvBps(debtValue, collateralValue) };
  });

  const debtValue = sum(loans.map((l) => l.debtValue));
  const collateralValue = sum(loans.map((l) => l.collateralValue));

  return { debtValue, collateralValue, portfolioLtvBps: ltvBps(debtValue, collateralValue), loans };
}

// ── Interest ─────────────────────────────────────────────────────────────────

/**
 * One day's interest on a loan's outstanding debt.
 *
 * COMPOUNDING, unlike `earn/interest.ts`, and the asymmetry is deliberate rather
 * than an inconsistency. Earn interest is PAID OUT to the depositor's available
 * balance each day, so the position's principal legitimately never changes. Loan
 * interest is not paid out — a borrower with an empty available balance cannot be
 * debited daily, and a design that tried would liquidate people for failing to
 * hold cash they had just borrowed against. So it CAPITALISES: the day's charge
 * increases the debt, and value moves only at repayment or liquidation.
 *
 * The consequence worth stating plainly: an accrual run moves NO money. It writes
 * one row. That is why its idempotency is a database uniqueness constraint on
 * (loan, day) rather than a ledger idempotency key — there is no ledger post to
 * deduplicate. See `loan-service.ts`.
 *
 * Rounds DOWN, in the borrower's favour. On a large enough loan the daily figure
 * is many orders of magnitude above the 10^-18 unit, so this is not a revenue
 * question; on a small enough loan it floors to zero and the day is free, which
 * is the correct way for that edge to break.
 */
export function dailyLoanInterest(debt: Amount, aprBps: number, daysPerYear = DAYS_PER_YEAR): Amount {
  if (debt <= 0n) return 0n;
  if (!Number.isInteger(aprBps) || aprBps < 0)
    throw new RiskError(`APR must be a non-negative integer in bps, got ${aprBps}`, 'bank.risk_invalid');
  if (aprBps === 0) return 0n;

  const annual = mulBps(debt, aprBps, 'floor');
  const perDay = daysPerYear === DAYS_PER_YEAR ? DAYS_PER_YEAR_SCALED : parseAmount(String(daysPerYear));
  return div(annual, perDay, 'floor');
}

/** `YYYY-MM-DD` in UTC — the accrual day, and half of the uniqueness key. */
export function accrualDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Every day from `after` (exclusive) to `until` (inclusive), in UTC.
 *
 * A crashed accrual job that comes back three days later must charge three days,
 * once each — not one day, and not three days twice. Deriving the list from the
 * last accrued day rather than from "today" is what makes catching up and
 * re-running the same operation.
 */
export function daysToAccrue(lastAccrued: string | null, openedAt: Date, until: Date, maxDays = 400): string[] {
  const end = accrualDay(until);
  const startFrom = lastAccrued ?? accrualDay(openedAt);
  const days: string[] = [];

  const cursor = new Date(`${startFrom}T00:00:00.000Z`);
  // Advance past the day already accrued (or past the open day — a loan drawn
  // this afternoon has not been outstanding for a day).
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (accrualDay(cursor) <= end) {
    days.push(accrualDay(cursor));
    if (days.length > maxDays) {
      // A loan that has gone unaccrued for over a year is an operational
      // incident, and charging 400 compounding days in one unattended batch is
      // not how anyone should find out about it.
      throw new RiskError(
        `Loan has ${days.length}+ unaccrued days since ${startFrom} — refusing to compound that in one run; ` +
          `an operator needs to look at why accrual stopped`,
        'bank.accrual_backlog',
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

// ── The liquidation ladder ───────────────────────────────────────────────────

export interface LiquidationPolicy {
  /** Above this, the borrower is warned and the grace clock starts. */
  readonly marginCallLtvBps: number;
  /** Above this, and only after grace, collateral may be sold. */
  readonly liquidationLtvBps: number;
  /**
   * Above this, grace is waived.
   *
   * THE UNCOMFORTABLE THRESHOLD, and the one place this design knowingly breaks
   * its own "a margin call must precede liquidation" rule. Both readings are
   * defensible and neither is free:
   *
   *   · Always honour grace. Clean, predictable, and on a gap move it guarantees
   *     the position is underwater by the time anything may be sold. The loss
   *     lands on the reserve and then the insurance fund — which is to say, on
   *     every other borrower and depositor, none of whom chose this leverage.
   *
   *   · Waive grace past the point where the collateral barely covers the debt.
   *     The borrower loses the chance to cure, on the day they were least likely
   *     to be able to. But the loss stays with the position that created it.
   *
   * This takes the second, and states it as a NUMBER in policy rather than an
   * exception in code, so it is visible, configurable per product, and shows up
   * in a diff when someone changes it.
   */
  readonly insolvencyLtvBps: number;
  /** Where a liquidation stops. Not zero — see `planLiquidation`. */
  readonly targetLtvBps: number;
  /** The borrower's cost of the event, on the proceeds of each tranche. */
  readonly penaltyBps: number;
  /** Ceiling on one rung, as a fraction of the loan's remaining collateral. */
  readonly maxTrancheBps: number;
  /** How long the borrower has to cure before a liquidation may start. */
  readonly graceSeconds: number;
}

export const DEFAULT_LIQUIDATION_POLICY: LiquidationPolicy = {
  marginCallLtvBps: 7_500,
  liquidationLtvBps: 8_500,
  insolvencyLtvBps: 9_500,
  targetLtvBps: 6_500,
  penaltyBps: 200,
  maxTrancheBps: 2_500,
  graceSeconds: 3_600,
};

export function assertPolicyCoherent(policy: LiquidationPolicy, maxLtvBps: number): void {
  const ordered =
    maxLtvBps < policy.marginCallLtvBps &&
    policy.marginCallLtvBps < policy.liquidationLtvBps &&
    policy.liquidationLtvBps <= policy.insolvencyLtvBps;

  if (!ordered) {
    throw new RiskError(
      `Incoherent policy: need maxLtv (${maxLtvBps}) < marginCall (${policy.marginCallLtvBps}) < ` +
        `liquidation (${policy.liquidationLtvBps}) <= insolvency (${policy.insolvencyLtvBps})`,
      'bank.policy_incoherent',
    );
  }
  if (policy.targetLtvBps >= policy.marginCallLtvBps) {
    // A liquidation that leaves the loan still in margin call has bought the
    // borrower nothing and will fire again on the next mark.
    throw new RiskError(
      `Liquidation target (${policy.targetLtvBps}) must be below the margin-call threshold (${policy.marginCallLtvBps}), ` +
        `or a liquidation leaves the loan still in margin call`,
      'bank.policy_incoherent',
    );
  }
  if (policy.maxTrancheBps <= 0 || policy.maxTrancheBps > BPS) {
    throw new RiskError(`maxTrancheBps must be in (0, ${BPS}], got ${policy.maxTrancheBps}`, 'bank.policy_incoherent');
  }
  if (policy.graceSeconds < 0) throw new RiskError('graceSeconds cannot be negative', 'bank.policy_incoherent');
}

export type LadderRung =
  | { readonly action: 'none'; readonly ltvBps: number }
  | { readonly action: 'margin-call'; readonly ltvBps: number }
  | {
      readonly action: 'liquidate';
      readonly ltvBps: number;
      /** Waived grace — the insolvency branch. Recorded so the decision is auditable. */
      readonly graceWaived: boolean;
      /** Collateral units to sell on THIS rung. */
      readonly collateralToSell: Amount;
      /** Debt-asset value that should realise, at the mark. */
      readonly expectedProceeds: Amount;
      /** True when this rung exhausts the loan's collateral. */
      readonly closesPosition: boolean;
    };

export interface LadderInput {
  readonly debt: Amount;
  readonly debtMark: Mark;
  readonly collateral: Amount;
  readonly collateralMark: Mark;
  readonly policy: LiquidationPolicy;
  /** When the margin call started, or null if the loan is not in one. */
  readonly marginCalledAt: Date | null;
  readonly now: Date;
}

/**
 * WHAT TO DO ABOUT ONE LOAN, RIGHT NOW.
 *
 * ── WHY A LADDER AND NOT A CLOSE-OUT ────────────────────────────────────────
 *
 * The derivatives design elsewhere in this repo insists on partial liquidation
 * before it will reach for an insurance fund, and the reasoning transfers here
 * intact — arguably more strongly, because loan collateral is a single spot asset
 * with no offsetting position anywhere.
 *
 * Selling a whole position into a thin book moves the price against the seller.
 * The seller here is the borrower whose collateral it is, and the buyer of last
 * resort is the platform. So a full close-out on a 76% LTV loan can realise less
 * than the debt on a position that was solvent a second earlier — manufacturing
 * exactly the bad debt the liquidation was meant to prevent. Two constraints
 * follow, and both are in this function:
 *
 *   1. Sell only as much as restores `targetLtvBps`, not all of it.
 *   2. Never sell more than `maxTrancheBps` of the remaining collateral on one
 *      rung, whatever the arithmetic asks for. The next mark decides whether
 *      another rung is needed, and by then the book has had time to refill.
 *
 * ── THE ALGEBRA ─────────────────────────────────────────────────────────────
 *
 * Selling `s` units at price `p` retires `s·p` of debt and removes `s` units of
 * collateral, so after the sale:
 *
 *     (D − s·p) / ((C − s)·p) = t          [t = target, as a fraction]
 *
 * Solving for the debt-asset value to retire, `v = s·p`:
 *
 *     v = (D − t·C·p) / (1 − t)
 *
 * Rounds DOWN throughout: the smallest sale that reaches the target, in the
 * borrower's favour. Under-selling by a unit means the next mark asks for another
 * rung; over-selling liquidates collateral that did not need to be sold, and
 * there is no posting that gives it back.
 */
export function planLiquidation(input: LadderInput): LadderRung {
  const { policy, debt, collateral } = input;

  if (input.collateralMark.price <= 0n || input.debtMark.price <= 0n) {
    // A zero or negative mark is not a cheap asset, it is a broken price feed,
    // and dividing by it decides how much of someone's collateral to sell.
    // `prices.ts` refuses these at the source; this is the second door.
    throw new RiskError(
      `Non-positive mark (${input.collateralMark.assetId}=${formatAmount(input.collateralMark.price)}, ` +
        `${input.debtMark.assetId}=${formatAmount(input.debtMark.price)}) — refusing to plan a liquidation against it`,
      'bank.mark_invalid',
    );
  }

  const debtValue = mul(debt, input.debtMark.price, 'ceil');
  const collateralValue = mul(collateral, input.collateralMark.price, 'floor');
  const ltv = ltvBps(debtValue, collateralValue);

  if (ltv < policy.marginCallLtvBps) return { action: 'none', ltvBps: ltv };
  if (ltv < policy.liquidationLtvBps) return { action: 'margin-call', ltvBps: ltv };

  // ── THE ORDERING GUARANTEE ────────────────────────────────────────────────
  // Past the liquidation threshold, a margin call must already have been raised
  // AND its grace must have expired. Without both halves this function would
  // liquidate on the first mark that crossed the line, and the borrower's first
  // notice of the loan would be its liquidation receipt.
  const graceWaived = ltv >= policy.insolvencyLtvBps;

  if (!graceWaived) {
    if (input.marginCalledAt === null) return { action: 'margin-call', ltvBps: ltv };

    const graceEnds = input.marginCalledAt.getTime() + policy.graceSeconds * 1_000;
    if (input.now.getTime() < graceEnds) return { action: 'margin-call', ltvBps: ltv };
  }

  if (collateral <= 0n) {
    // Nothing left to sell. The shortfall is bad debt and belongs to
    // `loanBadDebt`, not to another rung of a ladder with no rungs left.
    return { action: 'none', ltvBps: ltv };
  }

  const targetScaled = parseAmount(String(policy.targetLtvBps)) / BigInt(BPS);
  const one = parseAmount('1');

  // v = (D − t·C) / (1 − t), all in debt-asset value terms.
  const numerator = debtValue - mul(collateralValue, targetScaled, 'ceil');
  const denominator = one - targetScaled;

  let valueToRetire = numerator <= 0n ? 0n : div(numerator, denominator, 'floor');

  // Past the target being unreachable — a position already worth less than its
  // debt — the arithmetic asks for more than exists. Cap at the whole pot and
  // let the caller book the shortfall.
  if (valueToRetire > collateralValue) valueToRetire = collateralValue;

  let collateralToSell = div(valueToRetire, input.collateralMark.price, 'floor');

  const trancheCap = mulBps(collateral, policy.maxTrancheBps, 'floor');
  if (collateralToSell > trancheCap) collateralToSell = trancheCap;
  if (collateralToSell > collateral) collateralToSell = collateral;

  if (collateralToSell <= 0n) {
    // A rung that sells nothing is not a rung. Reached when the cap floors to
    // zero on a dust position; reported as a margin call so it stays visible
    // instead of looping forever on a liquidation that never moves.
    return { action: 'margin-call', ltvBps: ltv };
  }

  return {
    action: 'liquidate',
    ltvBps: ltv,
    graceWaived,
    collateralToSell,
    expectedProceeds: mul(collateralToSell, input.collateralMark.price, 'floor'),
    closesPosition: collateralToSell >= collateral,
  };
}

export interface ProceedsSplit {
  readonly principalRepaid: Amount;
  readonly interestRepaid: Amount;
  readonly penalty: Amount;
  readonly surplusToBorrower: Amount;
  /** Principal the proceeds could not cover. Bad debt if the position is closed. */
  readonly shortfall: Amount;
}

/**
 * WHO GETS WHAT out of one tranche's proceeds. The waterfall, in order:
 *
 *   1. PENALTY — the platform's cost of running the liquidation.
 *   2. INTEREST — accrued and unpaid.
 *   3. PRINCIPAL — back to the reserve.
 *   4. SURPLUS — whatever is left is the borrower's, and it goes back to them.
 *
 * Penalty first is the choice worth defending, because it is the one that takes
 * from the borrower before the lender is made whole. It is deliberate: the
 * penalty is small, capped in bps, and it is the only thing making a liquidation
 * more expensive to the borrower than voluntarily deleveraging — which is the
 * behaviour everyone wants. Putting it last would mean it is only ever collected
 * from borrowers who did not actually need liquidating.
 *
 * The penalty is also capped at what is left after interest and principal on a
 * short tranche, so it can never be collected out of the reserve's recovery.
 * Taking a fee out of the lender's money to cover the borrower's default would be
 * a straightforward transfer from depositors to the house.
 *
 * Surplus goes back to the borrower unconditionally. The stub this design
 * replaces credited the entire seizure to house fees; keeping the overshoot on a
 * forced sale is taking money that is not the platform's on the one day the
 * borrower is least able to argue about it.
 */
export function splitProceeds(input: {
  proceeds: Amount;
  interestOwed: Amount;
  principalOwed: Amount;
  penaltyBps: number;
  /** True when this tranche exhausts the collateral — the last chance to recover. */
  closesPosition: boolean;
}): ProceedsSplit {
  if (input.proceeds <= 0n) throw new RiskError('Cannot split zero proceeds', 'bank.risk_invalid');

  const owed = input.interestOwed + input.principalOwed;

  // The penalty is charged on the proceeds, then capped so it can never eat into
  // what is needed to cover the debt.
  const wanted = mulBps(input.proceeds, input.penaltyBps, 'floor');
  const headroom = input.proceeds > owed ? input.proceeds - owed : 0n;
  const penalty = wanted < headroom ? wanted : headroom;

  let left = input.proceeds - penalty;

  const interestRepaid = left < input.interestOwed ? left : input.interestOwed;
  left -= interestRepaid;

  const principalRepaid = left < input.principalOwed ? left : input.principalOwed;
  left -= principalRepaid;

  const shortfall = input.principalOwed - principalRepaid;

  return {
    principalRepaid,
    interestRepaid,
    penalty,
    surplusToBorrower: left,
    // A shortfall on a tranche that leaves collateral behind is not a loss yet —
    // the next rung may cover it. Only a closing tranche crystallises it.
    shortfall: input.closesPosition ? shortfall : 0n,
  };
}

/** For error messages and audit rows — never for arithmetic. */
export function describeLtv(bps: number): string {
  return bps === Number.MAX_SAFE_INTEGER ? 'unsecured' : `${(bps / 100).toFixed(2)}%`;
}

export { formatAmount };
