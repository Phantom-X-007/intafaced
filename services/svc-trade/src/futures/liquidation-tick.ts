/**
 * Liquidation tick (trade.futures residual).
 *
 * JOB SHAPE (not a wall-clock cron): one callable tick that:
 *  1. loads open positions
 *  2. asks an external MarkSource for each mark (never invents)
 *  3. plans via planLiquidation
 *  4. posts ledger recipes + marks position liquidated (via PositionCloser)
 *
 * Out of scope: mark oracle product, matching engine, funding.
 *
 * THE LADDER IS NO LONGER OUT OF SCOPE. This header used to list "partial
 * ladder" among the things this tick does not do, and it was accurate: every
 * trigger produced a FULL close, which `DIRECTION` §1 calls "a failure mode, not
 * a policy". Supply `deps.ladder` and the tick plans through
 * `maintenance-ladder.ts` instead — a depth-referenced maintenance requirement,
 * the smallest close that restores it, and a partial rung that REDUCES the
 * position rather than closing it. Leave `deps.ladder` off and the old
 * full-close planner runs unchanged, so nothing that already works moves.
 */
import { formatAmount, parseAmount, type Amount, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import { planLiquidation, summarizeLiquidation, type LiquidationPosition, type LiquidationDecision } from './liquidation-planner.js';
import {
  DEPTH_UNKNOWN,
  FuturesLadderError,
  mayLiquidateFromExpiredMarginCallGrace,
  planLadderLiquidation,
  summarizeLadder,
  type FuturesLadderPolicy,
} from './maintenance-ladder.js';
import { DEFAULT_FUTURES_MARK_POLICY, acceptableForLiquidation, type FuturesQuotedMark, type MarkPolicy } from './mark-policy.js';
import { breakerBasis, type AcceptedMarkStore } from './accepted-mark.js';
import { INSURANCE_UNDERFUNDED, checkInsuranceBound } from './insurance-bound.js';
import { parkUnderfundedWithAdl, type LiquidationAdlDeps } from './liquidation-adl-gate.js';
export type { LiquidationAdlDeps } from './liquidation-adl-gate.js';
