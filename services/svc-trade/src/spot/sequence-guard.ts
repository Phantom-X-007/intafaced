import type { Sql } from 'postgres';

/**
 * HAS THE ENGINE FORGOTTEN WHAT WE ALREADY SETTLED?
 *
 * ── The failure ─────────────────────────────────────────────────────────
 *
 * `OrderBook.sequence` is an in-memory counter that starts at 0. It survives a
 * restart only through the journal: `replay()` re-executes the recorded inputs,
 * and `fromState()` restores it from a snapshot. In the deployed shape the
 * journal is a named volume (`matchingjournal`), so it normally does survive.
 *
 * It does not survive ASYMMETRIC data loss — the engine's volume cleared while
 * Postgres keeps `trade.fills`. A wiped `.data` on a laptop, a re-created
 * container with an anonymous volume, a restore of one and not the other. The
 * engine then hands out sequence 1, 2, 3 for a market whose fills already run
 * to five hundred, and `fillIdFor(market, sequence)` — which is also the
 * ledger's `trade.fill:<id>` idempotency key — starts pointing at trades that
 * settled weeks ago.
 *
 * ── What already catches it, and what does not ──────────────────────────
 *
 * `insertFillLeg` catches the collision at settlement (#899): the second claim
 * on a `(market, sequence, role)` is refused by name instead of a Postgres 500.
 * That is the safety net and it works.
 *
 * But it fires on a USER'S ORDER. The first person to trade after a bad restart
 * gets the refusal, and the operator learns from that, which is the wrong way
 * round: the replica was already unfit to serve when it finished booting.
 *
 * So this is not a second guard on the money path — it is the same fact,
 * observed earlier, where a load balancer can act on it. `/ready` answering 503
 * keeps the replica out of rotation; a refused order does not.
 *
 * ── The invariant ───────────────────────────────────────────────────────
 *
 *   engine sequence for a market  >=  MAX(trade.fills.sequence) for that market
 *
 * Sound in one direction only, which is the direction that matters. The engine
 * consumes a sequence for every accept, cancel and fill, while `trade.fills`
 * records only the fills — so a healthy engine is always AHEAD, usually far
 * ahead. Behind is not a close call or a race; it means the counter restarted.
 *
 * A market with no recorded fills cannot be judged and is skipped rather than
 * guessed at.
 */

export interface SequenceRegression {
  readonly marketId: string;
  readonly symbol: string;
  /** Where the live book's counter is now. */
  readonly engineSequence: number;
  /** The highest sequence we have already settled and recorded. */
  readonly recordedSequence: number;
}

export interface SequenceGuardResult {
  /** Markets checked — those with at least one recorded fill and a reachable book. */
  readonly checked: number;
  /**
   * Markets whose engine counter is behind what we have settled. Empty is the
   * only healthy answer.
   */
  readonly regressions: readonly SequenceRegression[];
  /**
   * Markets that could not be judged: no fills yet, or the engine had no book
   * to report. NOT counted as healthy and NOT counted as failing — the same
   * distinction `/ready` draws elsewhere between "checked and fine" and "could
   * not tell".
   */
  readonly unjudged: number;
}

export interface SequenceGuardDeps {
  readonly sql: Sql;
  /** Live markets to check. */
  readonly markets: () => Promise<ReadonlyArray<{ id: string; symbol: string }>>;
  /**
   * The engine's current counter for a market, or null when it has no book.
   * `depth(marketId, 1)` is the cheapest way to ask — and since the memo landed
   * it is close to free.
   */
  readonly engineSequence: (marketId: string) => Promise<number | null>;
}

/**
 * Check every market once. Cheap enough for boot and for `/ready`: one grouped
 * query plus one depth call per market.
 */
export async function checkEngineSequences(deps: SequenceGuardDeps): Promise<SequenceGuardResult> {
  const markets = await deps.markets();
  if (markets.length === 0) return { checked: 0, regressions: [], unjudged: 0 };

  const rows = await deps.sql<Array<{ market_id: string; max_sequence: string | null }>>`
    SELECT market_id, MAX(sequence)::text AS max_sequence
      FROM trade.fills
     GROUP BY market_id
  `;
  const recorded = new Map(rows.map((r) => [r.market_id, Number(r.max_sequence)]));

  const regressions: SequenceRegression[] = [];
  let checked = 0;
  let unjudged = 0;

  for (const market of markets) {
    const recordedSequence = recorded.get(market.id);
    // Never traded: there is nothing to be behind of.
    if (recordedSequence === undefined || !Number.isFinite(recordedSequence)) {
      unjudged += 1;
      continue;
    }

    // A book the engine does not hold cannot be compared. Deliberately not
    // treated as a regression: an unlisted or idle market legitimately has no
    // book, and reporting that as corruption would make this alarm noise.
    const engineSequence = await deps.engineSequence(market.id);
    if (engineSequence === null) {
      unjudged += 1;
      continue;
    }

    checked += 1;
    if (engineSequence < recordedSequence) {
      regressions.push({ marketId: market.id, symbol: market.symbol, engineSequence, recordedSequence });
    }
  }

  return { checked, regressions, unjudged };
}

/** One line an operator can act on, naming the market and both numbers. */
export function describeRegressions(regressions: readonly SequenceRegression[]): string {
  const detail = regressions.map((r) => `${r.symbol} (engine ${r.engineSequence} < settled ${r.recordedSequence})`).join(', ');
  return (
    `the matching engine's sequence counter is BEHIND what this service has already settled: ${detail}. ` +
    `Its journal has been lost or replaced while trade.fills was kept, so it will re-issue sequences that already ` +
    `identify settled trades — and fillIdFor(market, sequence) is the ledger's idempotency key. ` +
    `Restore the engine's journal volume, or replay it, before serving traffic.`
  );
}
