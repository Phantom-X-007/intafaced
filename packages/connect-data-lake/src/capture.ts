/**
 * STAGE-1 CONNECT CAPTURE — §27:762 / D-S-18 / PTX-M06-R05 (connect.data-lake).
 *
 * Capture only. No TSDB, no retention policy, no compose database.
 *
 * A venue that is not connected is ABSENT in the record. An empty book is a
 * measured market condition and may be written only when the adapter said the
 * book exists and is empty. If the caller cannot tell those two apart, this
 * log writes absent — never `bids: []` as a fake quiet market.
 *
 * A later correction or bust is a NEW row. A measured fill is never rewritten.
 * Unknown stays absent — never an invented fill.
 */

export type CaptureKind = 'tick' | 'book' | 'fill' | 'correction' | 'bust';

export type FillAmendmentKind = 'correction' | 'bust';

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

/** Append-only amendment of a prior fill. Never mutates the original print. */
export interface MeasuredFillAmendment {
  readonly status: 'measured';
  readonly kind: FillAmendmentKind;
  readonly venueId: string;
  readonly marketId: string;
  readonly capturedAt: string;
  readonly originalSequence: number;
  readonly sequence: number;
  readonly ts: string;
  /** Replacement print for a correction. Omitted on bust — never invented. */
  readonly price?: string;
  readonly quantity?: string;
}

export type CaptureRecord = AbsentCapture | MeasuredTick | MeasuredBook | MeasuredFill | MeasuredFillAmendment;

export function isAbsentCapture(record: CaptureRecord): record is AbsentCapture {
  return record.status === 'absent';
}

export function isMeasuredBook(record: CaptureRecord): record is MeasuredBook {
  return record.status === 'measured' && record.kind === 'book';
}

export function isMeasuredFill(record: CaptureRecord): record is MeasuredFill {
  return record.status === 'measured' && record.kind === 'fill';
}

export function isFillAmendment(record: CaptureRecord): record is MeasuredFillAmendment {
  return record.status === 'measured' && (record.kind === 'correction' || record.kind === 'bust');
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

export interface FillAmendmentObservation {
  readonly venueId: string;
  readonly marketId: string;
  readonly connection: VenueConnection;
  readonly amendment: FillAmendmentKind;
  readonly originalSequence: number;
  readonly sequence: number;
  readonly ts: string;
  /** Replacement amounts — required for correction; bust must omit them. */
  readonly price?: string | null;
  readonly quantity?: string | null;
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

function decimalPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Unknown/unconnected stays absent. A correction without replacement amounts is
 * a hole — never a zero fill. A bust is measured without inventing amounts.
 */
export function classifyFillAmendment(
  observation: FillAmendmentObservation,
): { mode: 'absent'; reason: AbsentReason } | { mode: 'measured'; amendment: FillAmendmentKind } {
  const hasReplacement = decimalPresent(observation.price) && decimalPresent(observation.quantity);
  if (observation.connection !== 'connected') {
    return { mode: 'absent', reason: absentReason(observation.connection, hasReplacement) };
  }
  if (observation.amendment === 'correction' && !hasReplacement) {
    return { mode: 'absent', reason: 'observation_missing' };
  }
  return { mode: 'measured', amendment: observation.amendment };
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

  private append<T extends CaptureRecord>(record: T): T {
    this.rows.push(record);
    return Object.freeze(record);
  }

  private writeAbsent(kind: CaptureKind, venueId: string, marketId: string, reason: AbsentReason): AbsentCapture {
    return this.append({
      status: 'absent',
      reason,
      kind,
      venueId,
      marketId,
      capturedAt: this.stamp(),
    });
  }

  captureBook(observation: BookObservation): CaptureRecord {
    const classified = classifyBookObservation(observation);
    if (classified.mode === 'absent') {
      return this.writeAbsent('book', observation.venueId, observation.marketId, classified.reason);
    }
    return this.append({
      status: 'measured',
      kind: 'book',
      occupancy: occupancyOf(classified.snapshot.bids, classified.snapshot.asks),
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      sequence: classified.snapshot.sequence,
      bids: classified.snapshot.bids,
      asks: classified.snapshot.asks,
    });
  }

  captureTick(observation: TickObservation): CaptureRecord {
    const tick = observation.tick ?? null;
    if (observation.connection !== 'connected' || tick === null) {
      return this.writeAbsent('tick', observation.venueId, observation.marketId, absentReason(observation.connection, tick !== null));
    }
    return this.append({
      status: 'measured',
      kind: 'tick',
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      price: tick.price,
      quantity: tick.quantity,
      ts: tick.ts,
    });
  }

  captureFill(observation: FillObservation): CaptureRecord {
    const fill = observation.fill ?? null;
    if (observation.connection !== 'connected' || fill === null) {
      return this.writeAbsent('fill', observation.venueId, observation.marketId, absentReason(observation.connection, fill !== null));
    }
    return this.append({
      status: 'measured',
      kind: 'fill',
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      price: fill.price,
      quantity: fill.quantity,
      ts: fill.ts,
      sequence: fill.sequence,
    });
  }

  /**
   * Append a correction or bust. The original measured fill stays as written.
   * Unknown / missing replacement amounts stay absent — never a synthetic fill.
   */
  captureFillAmendment(observation: FillAmendmentObservation): CaptureRecord {
    const classified = classifyFillAmendment(observation);
    if (classified.mode === 'absent') {
      return this.writeAbsent(observation.amendment, observation.venueId, observation.marketId, classified.reason);
    }
    const record: MeasuredFillAmendment = {
      status: 'measured',
      kind: classified.amendment,
      venueId: observation.venueId,
      marketId: observation.marketId,
      capturedAt: this.stamp(),
      originalSequence: observation.originalSequence,
      sequence: observation.sequence,
      ts: observation.ts,
    };
    if (classified.amendment === 'correction' && decimalPresent(observation.price) && decimalPresent(observation.quantity)) {
      return this.append({
        ...record,
        price: observation.price.trim(),
        quantity: observation.quantity.trim(),
      });
    }
    return this.append(record);
  }
}
