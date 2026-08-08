/**
 * Paper trading — WHAT A DRILL IS ALLOWED TO SAY IT PRODUCED.
 * (TRK-academy.paper-trading, Stage 2: "completable with simulated results".)
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * `workbook-loop.ts` could already start a drill, tick steps off it, and hold
 * trade-supplied fill ids. What it could not do is produce a RESULT — and the
 * two things it never carried are exactly the two the row exists to guarantee:
 *
 *   1. Nothing it returned said "simulated". A drill card was shape-identical
 *      to a live one: `{ marketId, symbol, steps, completed }`. A client
 *      rendering it had nothing to put a badge on, and a support agent reading
 *      a screenshot had nothing to tell them which book they were looking at.
 *   2. There were no figures at all, so a workbook could be walked but never
 *      finished with anything to show for it.
 *
 * Adding (2) without (1) is how paper trading becomes a support incident: a
 * user reads a P&L, believes it, and asks to withdraw it. So the label is not
 * decoration bolted on at the edge — it is the ONLY constructor for a payload
 * here. `sealSimulated` is how a simulated figure comes into existence, and
 * `assertSealedSimulated` is a door the router passes every payload through
 * before it returns one. There is no unsealed path to write by accident.
 *
 * ── WHERE THE NUMBERS COME FROM, AND WHERE THEY DO NOT ──────────────────────
 *
 * Every price and size valued here is PUBLISHED BY TRADE and handed in. This
 * module has no price source, no mid, no book, and no clock-driven mark, and it
 * must never grow one. A simulated fill computed from a price nobody published
 * is not a simulation — it is a fabricated price wearing a "practice" badge,
 * and it is a lie told on the platform's behalf whichever book it lands in.
 *
 * So the two absences are answered differently, on purpose:
 *
 *   · a fill with no published price/size → `academy.paper_price_unavailable`.
 *     There is nothing to value and refusing is the only honest move.
 *   · an open position with no published mark → `unrealised: null` and
 *     `markUnavailable: true`. "We could not find out" is a true sentence and a
 *     useful one; marking it at the last trade price would be inventing the
 *     mark. Realised P&L is still reported, because closed size needs no mark.
 *
 * ── MONEY ───────────────────────────────────────────────────────────────────
 *
 * Decimal strings on the wire, scaled bigint in memory, via the one money
 * implementation in `@intafaced/ledger-client`. That import is the money MATH
 * (`parseAmount`/`mul`/`div`), never the client and never a recipe: doctrine
 * §0.6 says value moves only through the ledger, and a simulated drill moves
 * none — so it posts nothing, holds nothing, and settles nothing.
 * `ledger-isolation.test.ts` fails the build if that ever stops being true.
 *
 * That the amounts are fake is not a licence to store them in a `number`.
 * A float that cannot represent 0.1 misreports a practice P&L exactly as
 * cheerfully as a real one, and a drill whose figures are visibly wrong teaches
 * the student to distrust the surface rather than the market.
 */

import { div, formatAmount, mul, parseAmount, sub, type Amount } from '@intafaced/ledger-client';
import { AcademyError } from '../errors.js';

/** The only venue a sealed result may claim. There is no second one. */
export const SIMULATED_VENUE = 'paper' as const;

/** Said in full wherever a simulated figure is shown. Not an abbreviation. */
export const SIMULATED_DISCLAIMER =
  'Simulated result from a paper trading drill. No value moved, no ledger entry exists, and nothing here is withdrawable.';

/**
 * The seal. Four independent assertions rather than one boolean, because each
 * answers a different question a reader actually has, and a client that checks
 * only one still cannot mistake this for real money.
 */
export type SimulatedSeal = {
  readonly simulated: true;
  readonly venue: typeof SIMULATED_VENUE;
  readonly realLedger: false;
  readonly withdrawable: false;
  readonly disclaimer: string;
};

export const SIMULATED_SEAL: SimulatedSeal = {
  simulated: true,
  venue: SIMULATED_VENUE,
  realLedger: false,
  withdrawable: false,
  disclaimer: SIMULATED_DISCLAIMER,
};

/** A payload that has been through the door. */
export type Sealed<T> = SimulatedSeal & { readonly result: T };

/** The ONLY constructor for a paper figure that leaves this service. */
export function sealSimulated<T>(result: T): Sealed<T> {
  return { ...SIMULATED_SEAL, result };
}

/** True only when every part of the seal is present and says what it must. */
export function isSealedSimulated(value: unknown): value is Sealed<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['simulated'] === true &&
    v['venue'] === SIMULATED_VENUE &&
    v['realLedger'] === false &&
    v['withdrawable'] === false &&
    typeof v['disclaimer'] === 'string' &&
    (v['disclaimer'] as string).length > 0 &&
    'result' in v
  );
}

/**
 * The door. Called on every paper payload immediately before it is returned,
 * so a future refactor that drops the seal fails loudly here instead of
 * quietly shipping an unlabelled figure.
 */
export function assertSealedSimulated<T>(value: Sealed<T>): Sealed<T> {
  if (!isSealedSimulated(value)) {
    throw new AcademyError(
      'A paper drill result reached the wire without its simulated seal — refusing to return a figure that could be read as real.',
      'academy.paper_result_unlabelled',
    );
  }
  return value;
}

/** One-line label for logs, exports and operator boards. */
export function simulatedLabelLine(): string {
  return `simulated=1 venue=${SIMULATED_VENUE} realLedger=0 withdrawable=0`;
}

// ── Trade-published fills ───────────────────────────────────────────────────

export type SimulatedFillSide = 'buy' | 'sell';

/**
 * A fill as TRADE published it. `price` and `size` are decimal strings and
 * nothing else — a JSON number arriving here is refused rather than coerced,
 * because coercion is how a float gets into a book.
 */
export type PublishedFill = {
  readonly fillId: string;
  readonly marketId: string;
  readonly side: SimulatedFillSide;
  readonly price: string;
  readonly size: string;
};

function refusePrice(what: string): never {
  throw new AcademyError(
    `${what} — academy publishes no prices and will not invent one to finish a drill.`,
    'academy.paper_price_unavailable',
  );
}

/**
 * Parse a trade-published decimal string. Rejects `number`, blank, negative and
 * anything the ledger's own parser calls malformed.
 */
function publishedAmount(raw: unknown, field: string, fillId: string): Amount {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    refusePrice(`Fill ${fillId} carries no published ${field}`);
  }
  let parsed: Amount;
  try {
    parsed = parseAmount(raw.trim());
  } catch {
    refusePrice(`Fill ${fillId} has an unreadable published ${field} "${raw.trim()}"`);
  }
  if (parsed < 0n) refusePrice(`Fill ${fillId} has a negative published ${field}`);
  return parsed;
}

/**
 * Valuation of a drill. Every figure is a decimal string; `unrealised` and
 * `total` are `null` rather than a guess when the mark is unknown.
 */
export type SimulatedValuation = {
  readonly fillCount: number;
  readonly boughtSize: string;
  readonly soldSize: string;
  readonly openSize: string;
  readonly averageBuyPrice: string | null;
  readonly averageSellPrice: string | null;
  readonly realisedPnl: string;
  readonly unrealisedPnl: string | null;
  readonly totalPnl: string | null;
  /** True when an open position could not be marked because trade published no mark. */
  readonly markUnavailable: boolean;
};

/**
 * Value a drill from trade-published fills, and optionally a trade-published
 * mark for whatever is still open.
 *
 * Realised P&L is taken over the MATCHED size only — the smaller of bought and
 * sold — at the two average prices. Open size is left open. This is the
 * conservative reading and the only one that needs no mark, which matters
 * because the mark is precisely what may be missing.
 *
 * @throws AcademyError `academy.paper_price_unavailable` when a fill carries no
 *   readable published price or size.
 */
export function valueSimulatedDrill(fills: readonly PublishedFill[], markPrice: string | null = null): SimulatedValuation {
  let cost = 0n;
  let proceeds = 0n;
  let bought = 0n;
  let sold = 0n;

  for (const fill of fills) {
    const id = fill?.fillId ?? '(unnamed fill)';
    if (fill?.side !== 'buy' && fill?.side !== 'sell') {
      refusePrice(`Fill ${id} has no side, so it cannot be valued`);
    }
    const price = publishedAmount(fill.price, 'price', id);
    const size = publishedAmount(fill.size, 'size', id);
    const notional = mul(price, size, 'half-up');
    if (fill.side === 'buy') {
      cost += notional;
      bought += size;
    } else {
      proceeds += notional;
      sold += size;
    }
  }

  const averageBuy = bought > 0n ? div(cost, bought, 'half-up') : null;
  const averageSell = sold > 0n ? div(proceeds, sold, 'half-up') : null;

  const matched = bought < sold ? bought : sold;
  const realised = matched > 0n && averageBuy !== null && averageSell !== null ? mul(sub(averageSell, averageBuy), matched, 'half-up') : 0n;

  const open = bought - sold;

  let unrealised: Amount | null = 0n;
  let markUnavailable = false;
  if (open !== 0n) {
    if (typeof markPrice === 'string' && markPrice.trim().length > 0) {
      const mark = publishedAmount(markPrice, 'mark price', '(drill mark)');
      // Long open size gains as the mark rises above the average buy; short
      // open size gains as the mark falls below the average sell.
      const basis = open > 0n ? averageBuy : averageSell;
      if (basis === null) {
        unrealised = null;
        markUnavailable = true;
      } else {
        unrealised = mul(sub(mark, basis), open, 'half-up');
      }
    } else {
      // No published mark. Say so; do not price it ourselves.
      unrealised = null;
      markUnavailable = true;
    }
  }

  return {
    fillCount: fills.length,
    boughtSize: formatAmount(bought),
    soldSize: formatAmount(sold),
    openSize: formatAmount(open),
    averageBuyPrice: averageBuy === null ? null : formatAmount(averageBuy),
    averageSellPrice: averageSell === null ? null : formatAmount(averageSell),
    realisedPnl: formatAmount(realised),
    unrealisedPnl: unrealised === null ? null : formatAmount(unrealised),
    totalPnl: unrealised === null ? null : formatAmount(realised + unrealised),
    markUnavailable,
  };
}

/**
 * The total, or a refusal. For callers that genuinely need one number and must
 * not be handed a plausible-looking partial — the refusal is the answer.
 *
 * @throws AcademyError `academy.paper_price_unavailable` when the open size
 *   could not be marked from a published price.
 */
export function simulatedTotalPnlOrRefuse(valuation: SimulatedValuation): string {
  if (valuation.totalPnl === null) {
    refusePrice('Drill has an open position and trade published no mark for it');
  }
  return valuation.totalPnl;
}

/** True when the valuation is complete — nothing left unmarked. */
export function isValuationComplete(valuation: SimulatedValuation): boolean {
  return valuation.totalPnl !== null && !valuation.markUnavailable;
}

/** Operator one-liner. Carries the seal so a copied log line stays labelled. */
export function simulatedValuationLine(valuation: SimulatedValuation): string {
  const total = valuation.totalPnl ?? 'unmarked';
  return `${simulatedLabelLine()} fills=${valuation.fillCount} realised=${valuation.realisedPnl} total=${total}`;
}
