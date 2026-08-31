import { describe, expect, it } from 'vitest';
import {
  allowsMeasuredEmptyBook,
  allowsPersistenceClaim,
  CAPTURE_KINDS,
  describeCapturePolicy,
  wouldInventFill,
  wouldInventQuietMarket,
} from './capture-policy.js';

describe('describeCapturePolicy', () => {
  it('states capture honesty and owner-wired TSDB handoff', () => {
    const p = describeCapturePolicy();
    expect(p.captureKinds).toEqual(CAPTURE_KINDS);
    expect(p.unconnectedVenueIsAbsent).toBe(true);
    expect(p.holeNotSyntheticEmptyBook).toBe(true);
    expect(p.tsdbWriteWhenOwnerWired).toBe(true);
    expect(p.retentionOwnerEnvRequired).toBe(true);
    expect(p.inventsQuietMarket).toBe(false);
    expect(p.correctionIsNewCaptureRow).toBe(true);
    expect(p.measuredFillNeverRewritten).toBe(true);
    expect(p.unknownFillStaysAbsent).toBe(true);
    expect(p.inventsFillOnUnknown).toBe(false);
    expect(p.captureKinds).toEqual(['tick', 'book', 'fill', 'correction', 'bust']);
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

  it('detects fill invention from unknown or unconnected payloads', () => {
    expect(wouldInventFill('unknown', true)).toBe(true);
    expect(wouldInventFill('not_connected', true)).toBe(true);
    expect(wouldInventFill('connected', true)).toBe(false);
    expect(wouldInventFill('unknown', false)).toBe(false);
  });

  it('allows persistence claims only when owner env is wired', () => {
    expect(allowsPersistenceClaim('tsdb', {})).toBe(false);
    expect(allowsPersistenceClaim('retention', {})).toBe(false);
    expect(allowsPersistenceClaim('compose', {})).toBe(false);
    expect(
      allowsPersistenceClaim('tsdb', {
        CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
      }),
    ).toBe(true);
    expect(
      allowsPersistenceClaim('retention', {
        CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
        CONNECT_DATA_LAKE_RETENTION_DAYS: '30',
      }),
    ).toBe(true);
  });
});
