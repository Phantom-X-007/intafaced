import { CaptureLog } from './capture.js';
import type { CaptureLakeBookRecord } from './capture-lake-consumer.js';
import { describeIngestCaptureLakeBatch, ingestCaptureLakeBatch } from './ingest-capture-lake-batch.js';
import { describe, expect, it } from 'vitest';

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

describe('describeIngestCaptureLakeBatch', () => {
  it('reports capture-log-only when owner env unset', () => {
    expect(describeIngestCaptureLakeBatch({})).toEqual({
      ingestsFabricRecords: true,
      evaluatesPersistenceGate: true,
      writesTsdbWhenOwnerWired: true,
      persistenceEnvComplete: false,
      captureLogOnly: true,
    });
  });
});

describe('ingestCaptureLakeBatch', () => {
  it('refuses persistence when TSDB env unset', async () => {
    const log = new CaptureLog();
    const result = await ingestCaptureLakeBatch(log, [bookRecord], {});
    expect(result.ingested).toHaveLength(1);
    expect(result.persistence).toEqual({ ok: false, reason: 'no_tsdb' });
  });

  it('writes measured rows when owner env complete', async () => {
    const log = new CaptureLog();
    const queries: Array<{ query: string; params?: readonly unknown[] }> = [];
    const result = await ingestCaptureLakeBatch(
      log,
      [bookRecord],
      {
        CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
        CONNECT_DATA_LAKE_RETENTION_DAYS: '30',
      },
      {},
      {
        sql: {
          async unsafe(query, params) {
            queries.push({ query, params });
          },
        },
      },
    );
    expect(result.ingested).toHaveLength(1);
    expect(result.persistence).toEqual({
      ok: true,
      recordCount: 1,
      writtenCount: 1,
      tsdbUrl: 'postgres://lake',
      retentionDays: 30,
    });
    expect(queries).toHaveLength(1);
  });
});
