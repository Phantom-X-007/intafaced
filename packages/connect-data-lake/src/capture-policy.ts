/**
 * connect.data-lake capture policy — absent vs empty honesty (D-S-18 / §27:762).
 *
 * Capture honesty + owner-wired TSDB handoff. No compose database in package.
 *
 * Decided: unconnected venues are absent; measured empty is only when connected.
 * Not decided: time-series store, retention, compose — refuse if asked.
 */

import type { VenueConnection } from './capture.js';

export const CAPTURE_KINDS = ['tick', 'book', 'fill', 'correction', 'bust'] as const;

export type CapturePolicySummary = ReturnType<typeof describeCapturePolicy>;

/** Public honesty board for connect.data-lake Stage-1 capture log. */
export function describeCapturePolicy() {
  return {
    captureKinds: CAPTURE_KINDS,
    unconnectedVenueIsAbsent: true as const,
    emptyBookIsMeasuredNotAbsent: true as const,
    holeNotSyntheticEmptyBook: true as const,
    tsdbWriteWhenOwnerWired: true as const,
    retentionOwnerEnvRequired: true as const,
    inventsQuietMarket: false as const,
    correctionIsNewCaptureRow: true as const,
    measuredFillNeverRewritten: true as const,
    unknownFillStaysAbsent: true as const,
    inventsFillOnUnknown: false as const,
  };
}

/** Only a connected adapter may write a measured empty book. */
export function allowsMeasuredEmptyBook(connection: VenueConnection): boolean {
  return connection === 'connected';
}

/**
 * True when a caller would treat absence as a quiet market (synthetic empty book).
 * Unconnected or unknown connection with snapshot payload is the main hazard.
 */
export function wouldInventQuietMarket(connection: VenueConnection, snapshotPresent: boolean): boolean {
  return connection !== 'connected' && snapshotPresent;
}

/** True when a caller would write a fill/correction print without a connected measurement. */
export function wouldInventFill(connection: VenueConnection, fillPresent: boolean): boolean {
  return connection !== 'connected' && fillPresent;
}

/** Persistence claims require owner TSDB URL + retention days — never invented. */
export function allowsPersistenceClaim(claim: 'tsdb' | 'retention' | 'compose', env: NodeJS.ProcessEnv = process.env): boolean {
  if (claim === 'compose') return false;
  const tsdbUrl = env.CONNECT_DATA_LAKE_TSDB_URL?.trim() ?? '';
  const retentionDays = env.CONNECT_DATA_LAKE_RETENTION_DAYS?.trim() ?? '';
  if (claim === 'tsdb') return tsdbUrl.length > 0;
  return tsdbUrl.length > 0 && retentionDays.length > 0;
}
