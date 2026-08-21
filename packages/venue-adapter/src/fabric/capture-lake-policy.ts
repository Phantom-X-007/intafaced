/**
 * connect.data-lake fabric capture policy — hole vs quiet market honesty (D-S-18 / §27:762).
 *
 * Consolidates the public honesty posture from `capture-lake.ts`. Does not invent
 * mids, empty books for absence, TSDB claims, or retention policy.
 */

export const CAPTURE_LAKE_RECORD_KINDS = ['book', 'hole'] as const;

export type CaptureLakePolicySummary = ReturnType<typeof describeCaptureLakePolicy>;

/** Public honesty board for fabric CaptureLake (§27:762 / D-S-18). */
export function describeCaptureLakePolicy() {
  return {
    recordKinds: CAPTURE_LAKE_RECORD_KINDS,
    unconnectedVenueIsHole: true as const,
    quietMarketIsBookNotHole: true as const,
    holeNotSyntheticEmptyBook: true as const,
    bookFromCaptureNullOnHole: true as const,
    midFromCaptureNeverInvented: true as const,
    holeRoutingWeightZero: true as const,
    noTsdbInModule: true as const,
    noRetentionPolicyInModule: true as const,
    inventsQuietMarket: false as const,
    inventsMids: false as const,
  };
}

/** Only a connected, id-matched adapter may write a quiet-market book record. */
export function allowsQuietMarketBook(adapterPresent: boolean, venueIdMatches: boolean): boolean {
  return adapterPresent && venueIdMatches;
}

/**
 * True when a caller would treat absence as a quiet market (synthetic empty book).
 * Missing adapter or venue-id mismatch is the main hazard.
 */
export function wouldCollapseHoleToEmptyBook(adapterPresent: boolean, venueIdMatches: boolean): boolean {
  return !adapterPresent || !venueIdMatches;
}

/** In-memory capture log refuses persistence claims — store choice is owner/D-S-18 open. */
export function allowsPersistenceClaim(claim: 'tsdb' | 'retention' | 'compose'): false {
  void claim;
  return false;
}
