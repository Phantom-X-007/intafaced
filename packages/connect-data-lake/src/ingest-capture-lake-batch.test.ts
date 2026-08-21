import { describe, expect, it } from 'vitest';
import { CaptureLog } from './capture.js';
import type { CaptureLakeBookRecord } from './capture-lake-consumer.js';
import { ingestCaptureLakeBatch } from './ingest-capture-lake-batch.js';

const bookRecord: CaptureLakeBookRecord = {
  kind: 'book',
  venueId: 'v1',
  symbol: 'BTC/USDT',
  capturedAt: new Date('2026-01-01T00:00:00.000Z'),
  snapshot: {
    venueId: 'v1',
    symbol: 'BTC/USDT',
    bids: [[42_000n, 1n]],
    asks: [[42_001n, 2n]],
    sequence: 1,
    sequenced: true,
    observedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
};

describe('ingestCaptureLakeBatch', () => {
  it('refuses persistence when TSDB env unset', () => {
    const log = new CaptureLog();
    const result = ingestCaptureLakeBatch(log, [bookRecord], {});
    expect(result.ingested).toHaveLength(1);
    expect(result.persistence).toEqual({ ok: false, reason: 'no_tsdb' });
  });

  it('accepts flush claim when owner env complete', () => {
    const log = new CaptureLog();
    const result = ingestCaptureLakeBatch(log, [bookRecord], {
      CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
      CONNECT_DATA_LAKE_RETENTION_DAYS: '30',
    });
    expect(result.ingested).toHaveLength(1);
    expect(result.persistence).toEqual({
      ok: true,
      recordCount: 1,
      tsdbUrl: 'postgres://lake',
      retentionDays: 30,
    });
  });
});
