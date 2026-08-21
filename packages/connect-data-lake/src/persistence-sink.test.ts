import { CaptureLog } from './capture.js';
import { flushCaptureLogToPersistenceSink } from './persistence-sink.js';
import { describe, expect, it } from 'vitest';

describe('flushCaptureLogToPersistenceSink', () => {
  it('refuses when TSDB env unset', () => {
    const log = new CaptureLog();
    expect(flushCaptureLogToPersistenceSink(log.records(), {})).toEqual({ ok: false, reason: 'no_tsdb' });
  });

  it('refuses when retention days unset', () => {
    const log = new CaptureLog();
    expect(flushCaptureLogToPersistenceSink(log.records(), { CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake' })).toEqual({
      ok: false,
      reason: 'no_retention_policy',
    });
  });

  it('accepts flush claim when owner env complete', () => {
    const log = new CaptureLog();
    log.captureBook({
      venueId: 'v1',
      marketId: 'btc-usdt',
      connection: 'connected',
      snapshot: { sequence: 1, bids: [], asks: [] },
    });
    expect(
      flushCaptureLogToPersistenceSink(log.records(), {
        CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
        CONNECT_DATA_LAKE_RETENTION_DAYS: '30',
      }),
    ).toEqual({ ok: true, recordCount: 1, tsdbUrl: 'postgres://lake', retentionDays: 30 });
  });
});
