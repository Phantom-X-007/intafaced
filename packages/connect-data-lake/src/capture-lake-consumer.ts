/**
 * CAPTURE LAKE → CONNECT DATA LAKE — §27:762 / D-S-18 (connect.data-lake).
 *
 * Consumes fabric `CaptureLake` records into this package's capture log.
 * Structural twin of `packages/venue-adapter/src/fabric/capture-lake.ts` — no
 * import of `CaptureLake` here (venue-adapter → market-data → connect-data-lake
 * would cycle).
 *
 * Honesty preserved end-to-end:
 *   · `hole` with `not_connected` → absent `venue_not_connected` — never `bids: []`.
 *   · other holes → absent `observation_missing` — still never a synthetic book.
 *   · connected empty snapshot → measured `occupancy: 'empty'`.
 */

import { formatAmount } from '@intafaced/ledger-client';
import {
  CaptureLog,
  bookLevelsFromCapture,
  type AbsentReason,
  type BookObservation,
  type CaptureRecord,
  type WireLevel,
} from './capture.js';

/** Mirrors venue-adapter `CaptureHoleReason`. */
export type CaptureLakeHoleReason =
  | 'not_connected'
  | 'unreachable'
  | 'malformed'
  | 'not_ready'
  | 'stale'
  | 'clock_skew'
  | 'rate_limited'
  | 'desynced'
  | 'no_depth'
  | 'diverged'
  | 'capture_failed';

export interface CaptureLakeBookSnapshot {
  readonly venueId: string;
  readonly symbol: string;
  readonly bids: readonly (readonly [bigint, bigint])[];
  readonly asks: readonly (readonly [bigint, bigint])[];
  readonly sequence: number;
  readonly sequenced: boolean;
  readonly observedAt: Date;
}

export interface CaptureLakeBookRecord {
  readonly kind: 'book';
  readonly venueId: string;
  readonly symbol: string;
  readonly capturedAt: Date;
  readonly snapshot: CaptureLakeBookSnapshot;
}

export interface CaptureLakeHoleRecord {
  readonly kind: 'hole';
  readonly venueId: string;
  readonly symbol: string;
  readonly capturedAt: Date;
  readonly reason: CaptureLakeHoleReason;
  readonly detail: string;
}

export type CaptureLakeRecord = CaptureLakeBookRecord | CaptureLakeHoleRecord;

export interface IngestCaptureLakeOptions {
  /** Defaults to the lake record's `symbol`. */
  readonly marketId?: string;
}

export function isCaptureLakeHole(record: CaptureLakeRecord): record is CaptureLakeHoleRecord {
  return record.kind === 'hole';
}

export function isCaptureLakeBook(record: CaptureLakeRecord): record is CaptureLakeBookRecord {
  return record.kind === 'book';
}

export function absentReasonFromCaptureLakeHole(reason: CaptureLakeHoleReason): AbsentReason {
  if (reason === 'not_connected') return 'venue_not_connected';
  return 'observation_missing';
}

function wireLevelsFromBigintLevels(levels: readonly (readonly [bigint, bigint])[]): WireLevel[] {
  return levels.map(([price, qty]) => [formatAmount(price), formatAmount(qty)] as const);
}

/**
 * Map a fabric capture fact to a book observation for `CaptureLog.captureBook`.
 * Holes never carry snapshot payload — even if a caller tried to attach one elsewhere.
 */
export function bookObservationFromLakeRecord(record: CaptureLakeRecord, options: IngestCaptureLakeOptions = {}): BookObservation {
  const marketId = options.marketId ?? record.symbol;

  if (record.kind === 'hole') {
    return {
      venueId: record.venueId,
      marketId,
      connection: record.reason === 'not_connected' ? 'not_connected' : 'unknown',
      snapshot: null,
    };
  }

  const { snapshot } = record;
  return {
    venueId: record.venueId,
    marketId,
    connection: 'connected',
    snapshot: {
      sequence: snapshot.sequence,
      bids: wireLevelsFromBigintLevels(snapshot.bids),
      asks: wireLevelsFromBigintLevels(snapshot.asks),
    },
  };
}

/** Normalised capture row without mutating a log. */
export function captureRecordFromLakeRecord(record: CaptureLakeRecord, options: IngestCaptureLakeOptions = {}): CaptureRecord {
  const observation = bookObservationFromLakeRecord(record, options);
  const capturedAt = record.capturedAt.toISOString();

  if (observation.connection !== 'connected' || observation.snapshot === null || observation.snapshot === undefined) {
    return {
      status: 'absent',
      reason: absentReasonFromCaptureLakeHole(record.kind === 'hole' ? record.reason : 'not_connected'),
      kind: 'book',
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt,
    };
  }

  const { snapshot } = observation;
  const occupancy = snapshot.bids.length === 0 && snapshot.asks.length === 0 ? 'empty' : 'populated';
  return {
    status: 'measured',
    kind: 'book',
    occupancy,
    venueId: observation.venueId,
    marketId: observation.marketId,
    capturedAt,
    sequence: snapshot.sequence,
    bids: snapshot.bids,
    asks: snapshot.asks,
  };
}

/** Book levels for readers. Holes return `null` — never a synthetic empty book. */
export function bookLevelsFromLakeRecord(
  record: CaptureLakeRecord,
  options: IngestCaptureLakeOptions = {},
): ReturnType<typeof bookLevelsFromCapture> {
  return bookLevelsFromCapture(captureRecordFromLakeRecord(record, options));
}

/** Append one fabric capture fact into the stage-1 log with hole honesty. */
export function ingestCaptureLakeRecord(log: CaptureLog, record: CaptureLakeRecord, options: IngestCaptureLakeOptions = {}): CaptureRecord {
  return log.captureBook(bookObservationFromLakeRecord(record, options));
}

/** Append fabric capture facts in order. Holes remain first-class rows. */
export function ingestCaptureLakeRecords(
  log: CaptureLog,
  records: readonly CaptureLakeRecord[],
  options: IngestCaptureLakeOptions = {},
): CaptureRecord[] {
  return records.map((record) => ingestCaptureLakeRecord(log, record, options));
}
