import { describe, expect, it } from 'vitest';
import {
  allowsMeasuredEmptyBook,
  allowsPersistenceClaim,
  CAPTURE_KINDS,
  describeCapturePolicy,
  wouldInventQuietMarket,
} from './capture-policy.js';

describe('describeCapturePolicy', () => {
  it('states capture honesty without promising a time-series store', () => {
    const p = describeCapturePolicy();
    expect(p.captureKinds).toEqual(CAPTURE_KINDS);
    expect(p.unconnectedVenueIsAbsent).toBe(true);
    expect(p.holeNotSyntheticEmptyBook).toBe(true);
    expect(p.noTsdbInPackage).toBe(true);
    expect(p.inventsQuietMarket).toBe(false);
  });
});

describe('capture policy enforcement', () => {
  it('allows measured empty only when connected', () => {
    expect(allowsMeasuredEmptyBook('connected')).toBe(true);
    expect(allowsMeasuredEmptyBook('not_connected')).toBe(false);
    expect(allowsMeasuredEmptyBook('unknown')).toBe(false);
  });

  it('detects synthetic quiet-market invention from unconnected snapshots', () => {
    expect(wouldInventQuietMarket('not_connected', true)).toBe(true);
    expect(wouldInventQuietMarket('unknown', true)).toBe(true);
    expect(wouldInventQuietMarket('connected', true)).toBe(false);
    expect(wouldInventQuietMarket('not_connected', false)).toBe(false);
  });

  it('refuses persistence claims in stage-1 capture', () => {
    expect(allowsPersistenceClaim('tsdb')).toBe(false);
    expect(allowsPersistenceClaim('retention')).toBe(false);
    expect(allowsPersistenceClaim('compose')).toBe(false);
  });
});
