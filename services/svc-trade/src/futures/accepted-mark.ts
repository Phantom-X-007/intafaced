/**
 * THE DEVIATION BREAKER'S BASIS — the last mark a position was accepted against.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `mark-policy.ts`'s `acceptableForLiquidation` has always carried a deviation
 * breaker, and it has always been correct. It was also, until this file, DEAD:
 *
 *   · `liquidation-tick.ts` declared `previousMarkFor?:` OPTIONAL and no
 *     production caller ever supplied it, so `?? null` ran on every tick;
 *   · `position-service.ts`'s `requirePayoutGrade` passed a literal `null`.
 *
 * And `previous === null` is exactly the branch that SKIPS the breaker. So a
 * mark that jumped 100x cleared the payout gate and the house paid out on it —
 * 4,950,000 USDT on a 500-unit long whose feed went from 100 to 10,000, proven
 * in `position-service.test.ts` before this was written.
 *
 * A breaker with nothing to compare against is not a breaker. This file is the
 * memory it was missing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE BASIS COMES FROM, AND WHY IT CANNOT COME FROM ANYWHERE ELSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md`: **a price that moves money
 * is never supplied by the party it pays.** The basis is such a price — it is
 * the number that decides whether the paying mark is believable — so it is read
 * from `trade.positions.accepted_mark`, written by this service, from marks it
 * read from the mark port itself. There is no argument, no request field and no
 * cache key through which a caller reaches it.
 *
 * It is also written INSIDE the transaction that accepted the mark. That is not
 * an optimisation: it is what stops the ratchet. If a refused close still moved
 * the basis, a caller could walk the mark up in sub-breaker steps — 19%, 19%,
 * 19% — and arrive anywhere, one refusal at a time. A refusal rolls the basis
 * back with everything else, so the breaker measures from the last mark the
 * platform ACTED on, not from the last one it merely looked at.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIRST MARK IS UNARMED, AND THAT IS THE ONLY LEGITIMATE UNARMED CASE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A position's first valuation cannot deviate from anything — there is nothing
 * behind it. `PreviousMark` names that case (`first_valuation`) instead of
 * spelling it `null`, so an unarmed breaker is something a reader can see was
 * MEANT rather than something that happened because a field was optional. It is
 * also the narrowest possible window: `open()` records the entry mark as the
 * first accepted mark, so in practice a position is armed from the instant it
 * exists, and `first_valuation` survives only for rows written before this
 * migration.
 *
 * The basis is deliberately NOT `0` for the absent case. A zero basis makes
 * every later mark an infinite deviation, and this path has already decided
 * once that a missing price is not a zero price.
 */
import type { Sql } from 'postgres';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';

/**
 * The last mark a position was accepted against — or the named, deliberate
 * absence of one.
 *
 * A discriminated union rather than `Amount | null` because the two cases mean
 * genuinely different things to a reader: `first_valuation` is "this position
 * has no history and the breaker has nothing to measure", which is correct;
 * a bare `null` is also what "nobody wired this up" looked like for as long as
 * the defect lived.
 */
export type PreviousMark =
  | { readonly kind: 'accepted'; readonly price: Amount; readonly at: Date }
  /** A position's FIRST valuation. Nothing to deviate from — see the file header. */
  | { readonly kind: 'first_valuation' };

/** The one spelling of "this position has no previous mark". */
export const FIRST_VALUATION: PreviousMark = { kind: 'first_valuation' };

/**
 * A recorded basis. A non-positive stored value is a broken row, not a cheap
 * market, and it degrades to `first_valuation` rather than to a basis that
 * would make every mark an infinite deviation.
 */
export function acceptedMark(price: Amount, at: Date): PreviousMark {
  return price > 0n ? { kind: 'accepted', price, at } : FIRST_VALUATION;
}

/**
 * Narrow a `PreviousMark` to the argument `acceptableForLiquidation` takes.
 *
 * `mark-policy.ts` is a deliberate MIRROR of `svc-bank/src/loans/prices.ts` and
 * its signature is not ours to respell (see that file's header). So the
 * discriminated union lives on this side of the boundary and is flattened here,
 * in one named place, rather than every call site writing its own `null`.
 */
export function breakerBasis(previous: PreviousMark): Amount | null {
  return previous.kind === 'accepted' ? previous.price : null;
}

/**
 * Where a caller gets the basis, and where it puts a new one.
 *
 * Deliberately a required dependency everywhere it is used. The whole defect
 * was an OPTIONAL port that nobody supplied: a future call site that forgets
 * this one does not compile.
 */
export interface AcceptedMarkStore {
  /** The basis for this position. Never throws for an unknown id — that is a first valuation. */
  previous(positionId: string): Promise<PreviousMark>;
  /**
   * Record a mark that has just been ACCEPTED for this position.
   *
   * Call it only after a gate has passed and only on a path that is going to
   * complete — see the ratchet note in the file header.
   */
  record(positionId: string, mark: { price: Amount; at: Date }): Promise<void>;
}

/**
 * The durable basis: two columns on the position row itself.
 *
 * On the row and not in a side table, because the close path already holds that
 * row under `SELECT … FOR UPDATE` and therefore gets the read, the gate and the
 * write in one atomic step for free. A side table would need its own lock
 * ordering to say the same thing.
 */
export function sqlAcceptedMarkStore(sql: Sql): AcceptedMarkStore {
  return {
    async previous(positionId) {
      const rows = await sql<{ accepted_mark: string | null; accepted_mark_at: Date | null }[]>`
        SELECT accepted_mark, accepted_mark_at
        FROM trade.positions
        WHERE id = ${positionId}
        LIMIT 1
      `;
      return readAcceptedMark(rows[0] ?? null);
    },
    async record(positionId, mark) {
      // Open positions only. A closed or liquidated row has no next mark to
      // judge, and writing one would edit a settled record.
      await sql`
        UPDATE trade.positions
        SET accepted_mark = ${formatAmount(mark.price)}, accepted_mark_at = ${mark.at}, updated_at = now()
        WHERE id = ${positionId} AND status = 'open'
      `;
    },
  };
}

/**
 * Read the basis off a position row.
 *
 * Shared by the store and by `position-service.ts`, which reads the same two
 * columns off the row it has already locked rather than issuing a second query
 * that would not be inside its transaction.
 */
export function readAcceptedMark(row: { accepted_mark?: string | null; accepted_mark_at?: Date | string | null } | null): PreviousMark {
  const raw = row?.accepted_mark;
  if (raw == null || raw === '') return FIRST_VALUATION;
  let price: Amount;
  try {
    price = parseAmount(raw);
  } catch {
    // A basis we cannot read is not a basis. Unarmed beats a fabricated number.
    return FIRST_VALUATION;
  }
  const stamp = row?.accepted_mark_at;
  const at = stamp instanceof Date ? stamp : stamp != null ? new Date(stamp) : new Date(0);
  return acceptedMark(price, at);
}

/** In-memory basis for unit tests and single-process dev. Same port, no database. */
export function memoryAcceptedMarkStore(seed: Readonly<Record<string, Amount>> = {}): AcceptedMarkStore {
  const byPosition = new Map<string, { price: Amount; at: Date }>();
  for (const [positionId, price] of Object.entries(seed)) {
    byPosition.set(positionId, { price, at: new Date(0) });
  }
  return {
    async previous(positionId) {
      const found = byPosition.get(positionId);
      return found ? acceptedMark(found.price, found.at) : FIRST_VALUATION;
    },
    async record(positionId, mark) {
      byPosition.set(positionId, { price: mark.price, at: mark.at });
    },
  };
}
