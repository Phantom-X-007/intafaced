/**
 * connect.data-lake capture policy — absent vs empty honesty (D-S-18 / §27:762).
 *
 * Capture only. No TSDB, retention, or compose database in this package.
 */
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
