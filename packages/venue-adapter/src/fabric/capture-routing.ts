/**
 * CAPTURE → ROUTING WEIGHT (D26-P1-X2 deepen · coords #1739).
 *
 * §27:762 / D-S-18: a hole in capture is absence, not a quiet market.
 * §27:760 / D-S-18: an unscored (here: absent-in-capture) adapter must not
 * receive routing weight.
 *
 * #1739 lands `CaptureLake` / `CaptureRecord` (`kind: 'book' | 'hole'`). This
 * module is the score-feed bridge into §28 SOR: it accepts that same structural
 * shape without importing the lake class, so this PR stays path-disjoint from
 * `capture-lake.ts` / `fabric/index.ts` while remaining assignable once #1739
 * merges.
 *
 * Honesty:
 *   · `hole` → routing weight **zero** (never invent an empty book to route on).
 *   · `book` → weight **one** for capture eligibility only (empty book is a
 *     quiet-market fact from a connected adapter; fill still needs a quote).
 *   · No mids, no CCXT, no synthetic depth.
 */

/** Structural twin of #1739 CaptureRecord — book vs hole only. */
export type CaptureRoutingRecord =
  | {
      readonly kind: 'book';
      readonly venueId: string;
      readonly symbol: string;
    }
  | {
      readonly kind: 'hole';
      readonly venueId: string;
      readonly symbol: string;
      readonly reason: string;
      readonly detail?: string;
    };

export function isCaptureRoutingHole(record: CaptureRoutingRecord): record is Extract<CaptureRoutingRecord, { kind: 'hole' }> {
  return record.kind === 'hole';
}

/**
 * Connect score-feed weight from a capture fact.
 *
 * A hole is absence — weight 0. A book (including empty) is a connected
 * observation — weight 1. Callers that have not consulted capture must omit
 * the field on `SorCostTerms` rather than passing a fabricated book.
 */
export function routingWeightFromCapture(record: CaptureRoutingRecord): 0 | 1 {
  return record.kind === 'book' ? 1 : 0;
}
