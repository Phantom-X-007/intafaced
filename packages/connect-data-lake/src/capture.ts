/**
 * STAGE-1 CONNECT CAPTURE — §27:762 / D-S-18 (connect.data-lake).
 *
 * Capture only. No TSDB, no retention policy, no compose database.
 *
 * A venue that is not connected is ABSENT in the record. An empty book is a
 * measured market condition and may be written only when the adapter said the
 * book exists and is empty. If the caller cannot tell those two apart, this
 * log writes absent — never `bids: []` as a fake quiet market.
 */

export type CaptureKind = 'tick' | 'book' | 'fill';

export type AbsentReason = 'venue_not_connected' | 'adapter_no_connection' | 'observation_missing';

export type VenueConnection = 'connected' | 'not_connected' | 'unknown';

export type WireLevel = readonly [price: string, quantity: string];

export interface AbsentCapture {
  readonly status: 'absent';
  readonly reason: AbsentReason;
  readonly kind: CaptureKind;
  readonly venueId: string;
  readonly marketId: string;
  readonly capturedAt: string;
}

export interface MeasuredTick {
  readonly status: 'measured';
  readonly kind: 'tick';
  readonly venueId: string;
  readonly marketId: string;
  readonly capturedAt: string;
  readonly price: string;
  readonly quantity: string;
  readonly ts: string;
}

export interface MeasuredBook {
  readonly status: 'measured';
  readonly kind: 'book';
  readonly occupancy: 'empty' | 'populated';
  readonly venueId: string;
  readonly marketId: string;
  readonly capturedAt: string;
  readonly sequence: number;
  readonly bids: readonly WireLevel[];
  readonly asks: readonly WireLevel[];
}

export interface MeasuredFill {
  readonly status: 'measured';
  readonly kind: 'fill';
  readonly venueId: string;
  readonly marketId: string;
  readonly capturedAt: string;
  readonly price: string;
  readonly quantity: string;
  readonly ts: string;
  readonly sequence: number;
}

export type CaptureRecord = AbsentCapture | MeasuredTick | MeasuredBook | MeasuredFill;

export function isAbsentCapture(record: CaptureRecord): record is AbsentCapture {
  return record.status === 'absent';
}

export function isMeasuredBook(record: CaptureRecord): record is MeasuredBook {
  return record.status === 'measured' && record.kind === 'book';
}

/**
 * Book levels for consumers. Absent is `null` — never a synthetic empty book.
 * Measured empty is `{ occupancy: 'empty', bids: [], asks: [] }`.
 */
export function bookLevelsFromCapture(
  record: CaptureRecord,
): { occupancy: 'empty' | 'populated'; bids: readonly WireLevel[]; asks: readonly WireLevel[] } | null {
  if (!isMeasuredBook(record)) return null;
  return { occupancy: record.occupancy, bids: record.bids, asks: record.asks };
}

export interface CaptureClock {
  now(): Date;
}

const SYSTEM_CLOCK: CaptureClock = {
  now: () => new Date(),
};

export interface BookObservation {
  readonly venueId: string;
  readonly marketId: string;
  readonly connection: VenueConnection;
  /** Present only when the adapter returned a book (including measured empty). */
  readonly snapshot?: { readonly sequence: number; readonly bids: readonly WireLevel[]; readonly asks: readonly WireLevel[] } | null;
}

export interface TickObservation {
  readonly venueId: string;
  readonly marketId: string;
  readonly connection: VenueConnection;
  readonly tick?: { readonly price: string; readonly quantity: string; readonly ts: string } | null;
}

export interface FillObservation {
  readonly venueId: string;
  readonly marketId: string;
  readonly connection: VenueConnection;
  readonly fill?: { readonly price: string; readonly quantity: string; readonly ts: string; readonly sequence: number } | null;
}

function occupancyOf(bids: readonly WireLevel[], asks: readonly WireLevel[]): 'empty' | 'populated' {
  return bids.length === 0 && asks.length === 0 ? 'empty' : 'populated';
}

function absentReason(connection: VenueConnection, hasPayload: boolean): AbsentReason {
  if (connection === 'not_connected') return 'venue_not_connected';
  if (connection === 'unknown') return 'observation_missing';
  return hasPayload ? 'observation_missing' : 'adapter_no_connection';
}

/**
 * Decide measured vs absent. Unknown connection prefers absent over silent empty.
 * An empty snapshot on a connected venue is measured empty — not a hole.
 */
export function classifyBookObservation(
  observation: BookObservation,
): { mode: 'absent'; reason: AbsentReason } | { mode: 'measured'; snapshot: NonNullable<BookObservation['snapshot']> } {
  const snapshot = observation.snapshot ?? null;
  if (observation.connection !== 'connected' || snapshot === null) {
    return { mode: 'absent', reason: absentReason(observation.connection, snapshot !== null) };
  }
  return { mode: 'measured', snapshot };
}

/**
 * Append-only in-process capture log. Not a store. Holes are first-class rows.
 */
export class CaptureLog {
  private readonly rows: CaptureRecord[] = [];

  constructor(private readonly clock: CaptureClock = SYSTEM_CLOCK) {}

  records(): readonly CaptureRecord[] {
    return this.rows;
  }

  absent(): readonly AbsentCapture[] {
    return this.rows.filter(isAbsentCapture);
  }

  private stamp(): string {
    return this.clock.now().toISOString();
  }

  private writeAbsent(kind: CaptureKind, venueId: string, marketId: string, reason: AbsentReason): AbsentCapture {
    const record: AbsentCapture = {
      status: 'absent',
      reason,
      kind,
      venueId,
      marketId,
      capturedAt: this.stamp(),
    };
    this.rows.push(record);
    return record;
  }

  captureBook(observation: BookObservation): CaptureRecord {
    const classified = classifyBookObservation(observation);
    if (classified.mode === 'absent') {
      return this.writeAbsent('book', observation.venueId, observation.marketId, classified.reason);
    }
    const record: MeasuredBook = {
      status: 'measured',
      kind: 'book',
      occupancy: occupancyOf(classified.snapshot.bids, classified.snapshot.asks),
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      sequence: classified.snapshot.sequence,
      bids: classified.snapshot.bids,
      asks: classified.snapshot.asks,
    };
    this.rows.push(record);
    return record;
  }

  captureTick(observation: TickObservation): CaptureRecord {
    const tick = observation.tick ?? null;
    if (observation.connection !== 'connected' || tick === null) {
      return this.writeAbsent('tick', observation.venueId, observation.marketId, absentReason(observation.connection, tick !== null));
    }
    const record: MeasuredTick = {
      status: 'measured',
      kind: 'tick',
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      price: tick.price,
      quantity: tick.quantity,
      ts: tick.ts,
    };
    this.rows.push(record);
    return record;
  }

  captureFill(observation: FillObservation): CaptureRecord {
    const fill = observation.fill ?? null;
    if (observation.connection !== 'connected' || fill === null) {
      return this.writeAbsent('fill', observation.venueId, observation.marketId, absentReason(observation.connection, fill !== null));
    }
    const record: MeasuredFill = {
      status: 'measured',
      kind: 'fill',
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      price: fill.price,
      quantity: fill.quantity,
      ts: fill.ts,
      sequence: fill.sequence,
    };
    this.rows.push(record);
    return record;
  }
}
