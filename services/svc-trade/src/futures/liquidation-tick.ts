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
  DEFAULT_FUTURES_LADDER_POLICY,
  DEPTH_UNKNOWN,
  FuturesLadderError,
  planLadderLiquidation,
  summarizeLadder,
  type FuturesLadderPolicy,
} from './maintenance-ladder.js';
import {
  DEFAULT_FUTURES_MARK_POLICY,
  MARK_INVALID,
  acceptableForLiquidation,
  type FuturesQuotedMark,
  type MarkPolicy,
} from './mark-policy.js';
import { breakerBasis, type AcceptedMarkStore } from './accepted-mark.js';

/** External mark for one market. Null → skip that position (never invent). */
export interface MarkSource {
  markPrice(input: { marketId: string; symbol?: string; at: Date }): Promise<string | null>;
  /**
   * The same mark, LABELLED — price, observation time, and how it was derived.
   *
   * Optional so every existing adapter still satisfies `MarkSource`. A source
   * that provides it gets the `mark-policy.ts` gates applied here, with a
   * stated reason instead of a bare null; a source that does not is limited to
   * whatever gating it does internally.
   */
  quote?(input: { marketId: string; symbol?: string; at: Date }): Promise<FuturesQuotedMark | null>;
}

/** A MarkSource that can say what kind of price it is handing you. */
export interface QuotedMarkSource extends MarkSource {
  quote(input: { marketId: string; symbol?: string; at: Date }): Promise<FuturesQuotedMark | null>;
}

export interface LiquidationPositionRow extends LiquidationPosition {
  marketId: string;
  symbol?: string;
}

export interface LiquidationPositionLoader {
  listOpen(): Promise<readonly LiquidationPositionRow[]>;
}

/**
 * After recipes post, close the position row as liquidated.
 * Production wires PositionService; tests use a recorder.
 */
export interface PositionCloser {
  markLiquidated(positionId: string, meta: { liquidationId: string; reason: string }): Promise<void>;
}

/**
 * Shrink a position after a PARTIAL rung, once its recipes have posted.
 *
 * `sizeClosed` leaves the position and `marginRemaining` is what the ledger left
 * in the collateral pot after the tranche's realised loss — passed as an absolute
 * figure rather than a delta so the row cannot drift from the pot through a
 * missed or replayed call.
 *
 * THE ENTRY PRICE DOES NOT MOVE. The tranche was realised at the mark; the
 * remainder still carries the position the trader actually opened, and re-basing
 * it would silently rewrite their cost basis on the one day they are least able
 * to argue about it.
 */
export interface PositionReducer {
  reduce(positionId: string, input: { liquidationId: string; sizeClosed: Amount; marginRemaining: Amount; reason: string }): Promise<void>;
}

/** The book this position would have to be closed INTO. Null → skip (never invent depth). */
export interface DepthNotionalSource {
  depthNotional(input: { marketId: string; side: 'long' | 'short'; symbol?: string }): Promise<Amount | null>;
}

/**
 * Everything the partial ladder needs, and nothing optional inside it.
 *
 * Grouped rather than spread across `LiquidationTickDeps` so the ladder cannot be
 * half-wired: a caller either supplies a depth source AND a reducer, or does not
 * use the ladder at all. A partial rung with no reducer would post a realised
 * loss and leave the position row at its original size — the ledger and the book
 * disagreeing about how big someone's position is, which is the worst available
 * outcome and precisely what an optional port would permit.
 */
export interface LiquidationLadderDeps {
  depth: DepthNotionalSource;
  reducer: PositionReducer;
  policy?: FuturesLadderPolicy;
}

/** Prevent double-liquidation attempts for the same position+attempt key. */
export interface LiquidationAttemptStore {
  isDone(liquidationId: string): Promise<boolean>;
  markDone(liquidationId: string): Promise<void>;
}

export interface LiquidationTickDeps {
  marks: MarkSource;
  positions: LiquidationPositionLoader;
  closer: PositionCloser;
  attempts: LiquidationAttemptStore;
  ledger: Pick<LedgerClient, 'post'>;
  maintenanceBps?: number;
  now?: () => Date;
  /** Build stable attempt id. Default: liq:{positionId}:{isoMinute} */
  liquidationIdFor?: (row: LiquidationPositionRow, at: Date) => string;
  /** Gates a labelled mark must clear before it may close a position. */
  markPolicy?: MarkPolicy;
  /**
   * Where the deviation breaker gets its basis, and where an accepted mark goes.
   *
   * REQUIRED, and required on purpose. This used to be
   * `previousMarkFor?: (row) => …` — optional, supplied by no production caller,
   * and therefore `null` on every tick, which is precisely the branch that skips
   * the breaker. An optional safety port is a disabled safety port. Making it
   * mandatory means a future call site that forgets it does not compile;
   * `memoryAcceptedMarkStore()` is the honest answer for a unit test, and
   * `sqlAcceptedMarkStore(sql)` for production.
   */
  acceptedMarks: AcceptedMarkStore;
  /**
   * Present → plan through the partial-liquidation ladder. Absent → the legacy
   * full-close planner, unchanged. See the file header.
   */
  ladder?: LiquidationLadderDeps;
}

export interface LiquidationTickItemResult {
  positionId: string;
  outcome:
    | 'skipped_no_mark'
    | 'skipped_mark_unusable'
    | 'skipped_no_depth'
    | 'skipped_healthy'
    | 'skipped_already'
    | 'margin_call'
    | 'partially_liquidated'
    | 'liquidated'
    | 'invalid';
  reason: string;
  summary?: string;
}

export interface LiquidationTickResult {
  scanned: number;
  liquidated: number;
  /** Rungs that shrank a position without closing it. Not counted in `liquidated`. */
  partial: number;
  /** Positions under the margin-call threshold but not yet liquidatable. */
  marginCalls: number;
  items: LiquidationTickItemResult[];
}

/**
 * "The source handed back something that is not a price."
 *
 * Distinct from `null`, which means "the source has no price right now". A
 * source that returns `"abc"` is broken, and a broken source is not the same
 * event as a quiet one — it used to reach `planLiquidation` and come back as
 * `invalid_mark`, having already skipped every gate on the way.
 */
const UNREADABLE = Symbol('trade.mark_unreadable');

/**
 * A source that predates `quote()` gives a price and nothing else. Read it as
 * `mid` observed now — what `markPrice` has always implied, and the same
 * reading `position-service.ts` gives it — rather than inventing a quality it
 * never claimed, or skipping the gates because it never claimed one.
 */
async function legacyQuote(
  marks: MarkSource,
  row: LiquidationPositionRow,
  at: Date,
): Promise<FuturesQuotedMark | null | typeof UNREADABLE> {
  const price = await marks.markPrice({ marketId: row.marketId, symbol: row.symbol, at });
  if (price == null || price.trim() === '') return null;
  let parsed: Amount;
  try {
    parsed = parseAmount(price);
  } catch {
    return UNREADABLE;
  }
  return { marketId: row.marketId, symbol: row.symbol, price: parsed, asOf: at, quality: 'mid' };
}

/**
 * Scan open positions once; liquidate those the planner says are underwater
 * given external marks only.
 */
export async function runLiquidationTick(deps: LiquidationTickDeps): Promise<LiquidationTickResult> {
  const at = (deps.now ?? (() => new Date()))();
  const open = await deps.positions.listOpen();
  const items: LiquidationTickItemResult[] = [];
  let liquidated = 0;
  let partial = 0;
  let marginCalls = 0;

  for (const row of open) {
    const liquidationId = deps.liquidationIdFor?.(row, at) ?? `liq:${row.positionId}:${at.toISOString().slice(0, 16)}`;

    if (await deps.attempts.isDone(liquidationId)) {
      items.push({ positionId: row.positionId, outcome: 'skipped_already', reason: 'already_done' });
      continue;
    }

    /**
     * THE GATE, BEFORE ANYTHING IS SEIZED.
     *
     * Every mark — labelled or legacy — is judged by `acceptableForLiquidation`:
     * quality, the tighter liquidation staleness limit, and the deviation
     * breaker. `last` never passes under the default policy, so a market with no
     * two-sided quote cannot be liquidated at all: the position sits and an
     * operator looks at it.
     *
     * THE LEGACY BRANCH GOES THROUGH THE SAME GATE. It used to hand
     * `markPrice`'s bare string straight to the planner, which meant a
     * `MarkSource` without `quote()` was seizing positions with no breaker at
     * all — the same hole in a second costume. An unlabelled price is read as
     * `mid` observed now, which is exactly what `markPrice` has always implied
     * (`position-service.ts` reads it the same way), and then it is gated.
     *
     * Either way, ABSENT IS NOT ZERO. There is no branch below that turns a
     * missing mark into a price — on a perp, valuing a missing mark at zero
     * does not misprice one position, it liquidates every one of them.
     */
    const quoted = deps.marks.quote
      ? await deps.marks.quote({ marketId: row.marketId, symbol: row.symbol, at })
      : await legacyQuote(deps.marks, row, at);

    if (quoted === UNREADABLE) {
      items.push({
        positionId: row.positionId,
        outcome: 'skipped_mark_unusable',
        reason: MARK_INVALID,
        summary: `${row.marketId}: mark source returned a value that is not a price`,
      });
      continue;
    }
    if (!quoted) {
      items.push({ positionId: row.positionId, outcome: 'skipped_no_mark', reason: 'no_mark' });
      continue;
    }

    /**
     * THE BREAKER, ARMED. `previous` is read from storage the position's owner
     * cannot reach — `trade.positions.accepted_mark`, written by this service
     * from marks it read itself. Before `accepted-mark.ts` existed this was a
     * literal `null` on every tick and the breaker never fired once.
     */
    const previous = await deps.acceptedMarks.previous(row.positionId);
    const check = acceptableForLiquidation(quoted, breakerBasis(previous), at, deps.markPolicy ?? DEFAULT_FUTURES_MARK_POLICY);
    if (!check.ok) {
      items.push({
        positionId: row.positionId,
        outcome: 'skipped_mark_unusable',
        reason: check.code ?? 'trade.mark_unusable',
        summary: check.reason,
      });
      continue;
    }

    /**
     * Recorded because it was ACCEPTED, not because it was acted on — a healthy
     * position's mark is still a mark this position was judged against, and it
     * is what keeps the basis walking with the market so an honest 30% day over
     * many ticks never looks like one impossible jump. A REFUSED mark is
     * deliberately not recorded: that is what stops a caller ratcheting the
     * basis along in sub-breaker steps.
     */
    await deps.acceptedMarks.record(row.positionId, { price: quoted.price, at });
    const mark = formatAmount(quoted.price);

    if (deps.ladder) {
      const outcomeItem = await runLadderRung(deps, deps.ladder, row, quoted.price, liquidationId);
      items.push(outcomeItem);
      if (outcomeItem.outcome === 'liquidated') liquidated += 1;
      else if (outcomeItem.outcome === 'partially_liquidated') partial += 1;
      else if (outcomeItem.outcome === 'margin_call') marginCalls += 1;
      continue;
    }

    const decision: LiquidationDecision = planLiquidation({
      liquidationId,
      position: row,
      markPrice: mark,
      maintenanceBps: deps.maintenanceBps,
    });

    if (!decision.liquidate) {
      const outcome =
        decision.reason === 'invalid_mark' || decision.reason === 'invalid_maintenance_bps' || decision.reason === 'empty_position'
          ? 'invalid'
          : 'skipped_healthy';
      items.push({
        positionId: row.positionId,
        outcome,
        reason: decision.reason,
        summary: summarizeLiquidation(decision),
      });
      continue;
    }

    for (const recipe of decision.recipes) {
      await deps.ledger.post(recipe as PostRequest);
    }
    await deps.closer.markLiquidated(row.positionId, { liquidationId, reason: decision.reason });
    await deps.attempts.markDone(liquidationId);
    liquidated += 1;
    items.push({
      positionId: row.positionId,
      outcome: 'liquidated',
      reason: decision.reason,
      summary: summarizeLiquidation(decision),
    });
  }

  return { scanned: open.length, liquidated, partial, marginCalls, items };
}

/**
 * ONE POSITION, THROUGH THE LADDER.
 *
 * Split out rather than inlined because the ORDER of the four steps below is the
 * whole safety property, and it is easier to check when it is not buried in the
 * scan loop.
 *
 *   1. Read the depth this position would be closed into. No depth → skip.
 *   2. Plan. A refusal or a healthy rung → skip, and nothing posts.
 *   3. Post the recipes. The ledger dedupes on `liquidationId`.
 *   4. THEN move the row — reduce on a partial rung, close on a closing one.
 *
 * Step 4 last, and the attempt only marked done after it, so a crash between 3
 * and 4 re-runs the whole rung: the ledger moves nothing twice on the replay, and
 * the row catches up. The reverse order would shrink a position whose loss never
 * posted.
 */
async function runLadderRung(
  deps: LiquidationTickDeps,
  ladder: LiquidationLadderDeps,
  row: LiquidationPositionRow,
  markPrice: Amount,
  liquidationId: string,
): Promise<LiquidationTickItemResult> {
  let depthNotional: Amount | null;
  try {
    depthNotional = await ladder.depth.depthNotional({ marketId: row.marketId, side: row.side, symbol: row.symbol });
  } catch {
    depthNotional = null;
  }

  if (depthNotional == null || depthNotional <= 0n) {
    /**
     * A BOOK WE COULD NOT READ IS NOT A DEEP BOOK.
     *
     * The maintenance requirement is keyed on depth, so an unreadable side has no
     * requirement — and the only honest answers are "assume the worst tier" or
     * "do not act". Assuming the worst tier would liquidate every position on the
     * venue the moment a depth call failed, which is the missing-mark mistake
     * wearing a different hat. The position sits and an operator looks at it.
     */
    return {
      positionId: row.positionId,
      outcome: 'skipped_no_depth',
      reason: DEPTH_UNKNOWN,
      summary: `${row.marketId}: no readable ${row.side === 'long' ? 'bid' : 'ask'} depth to rate this position against`,
    };
  }

  let decision;
  try {
    decision = planLadderLiquidation({
      liquidationId,
      position: row,
      markPrice,
      depthNotional,
      policy: ladder.policy ?? DEFAULT_FUTURES_LADDER_POLICY,
    });
  } catch (err) {
    // An incoherent policy is an operator problem on every position, not a market
    // event on this one — surfaced per position so it cannot be scrolled past.
    const code = err instanceof FuturesLadderError ? err.code : 'trade.ladder_failed';
    return { positionId: row.positionId, outcome: 'invalid', reason: code, summary: (err as Error).message };
  }

  if (!decision.liquidate) {
    const outcome =
      decision.rung.action === 'margin-call'
        ? 'margin_call'
        : decision.rung.action === 'refuse' &&
            (decision.reason === 'invalid_mark' || decision.reason === 'empty_position' || decision.reason === 'invalid_margin')
          ? 'invalid'
          : decision.rung.action === 'refuse'
            ? 'invalid'
            : 'skipped_healthy';
    return { positionId: row.positionId, outcome, reason: decision.reason, summary: summarizeLadder(decision) };
  }

  for (const recipe of decision.recipes) {
    await deps.ledger.post(recipe as PostRequest);
  }

  if (decision.closesPosition) {
    await deps.closer.markLiquidated(row.positionId, { liquidationId, reason: decision.reason });
  } else {
    await ladder.reducer.reduce(row.positionId, {
      liquidationId,
      sizeClosed: decision.sizeClosed,
      marginRemaining: decision.marginRemaining,
      reason: decision.reason,
    });
  }
  await deps.attempts.markDone(liquidationId);

  return {
    positionId: row.positionId,
    outcome: decision.closesPosition ? 'liquidated' : 'partially_liquidated',
    reason: decision.reason,
    summary: summarizeLadder(decision),
  };
}

export function memoryLiquidationAttemptStore(): LiquidationAttemptStore {
  const done = new Set<string>();
  return {
    async isDone(id) {
      return done.has(id);
    },
    async markDone(id) {
      done.add(id);
    },
  };
}
