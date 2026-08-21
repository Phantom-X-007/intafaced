/**
 * connect.data-lake capture policy — absent vs empty honesty (D-S-18 / §27:762).
 *
 * Capture only. No TSDB, retention, or compose database in this package.
 *
 * Decided: unconnected venues are absent; measured empty is only when connected.
 * Not decided: time-series store, retention, compose — refuse if asked.
 */

import type { VenueConnection } from './capture.js';

export const CAPTURE_KINDS = ['tick', 'book', 'fill'] as const;

export type CapturePolicySummary = ReturnType<typeof describeCapturePolicy>;

/** Public honesty board for connect.data-lake Stage-1 capture log. */
export function describeCapturePolicy() {
  return {
    captureKinds: CAPTURE_KINDS,
    unconnectedVenueIsAbsent: true as const,
    emptyBookIsMeasuredNotAbsent: true as const,
    holeNotSyntheticEmptyBook: true as const,
    noTsdbInPackage: true as const,
    noRetentionPolicyInPackage: true as const,
    inventsQuietMarket: false as const,
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

/** Stage-1 capture refuses persistence claims — store choice is owner/D-S-18 open. */
export function allowsPersistenceClaim(claim: 'tsdb' | 'retention' | 'compose'): false {
  void claim;
  return false;
}
