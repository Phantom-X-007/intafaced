import { CaptureLog } from './capture.js';
import { flushCaptureLogToPersistenceSink } from './persistence-sink.js';
import type { PersistenceSqlClient } from './postgres-persistence-sink.js';
import { describe, expect, it } from 'vitest';

function mockSql(): { client: PersistenceSqlClient; queries: Array<{ query: string; params?: readonly unknown[] }> } {
  const queries: Array<{ query: string; params?: readonly unknown[] }> = [];
  const client: PersistenceSqlClient = {
    async unsafe(query, params) {
      queries.push({ query, params });
      return [];
    },
  };
  return { client, queries };
}

describe('flushCaptureLogToPersistenceSink', () => {
  it('refuses when TSDB env unset', async () => {
    const log = new CaptureLog();
    await expect(flushCaptureLogToPersistenceSink(log.records(), {})).resolves.toEqual({ ok: false, reason: 'no_tsdb' });
  });

  it('refuses when retention days unset', async () => {
    const log = new CaptureLog();
    await expect(flushCaptureLogToPersistenceSink(log.records(), { CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake' })).resolves.toEqual({
      ok: false,
      reason: 'no_retention_policy',
    });
  });

  it('INSERTs measured rows when owner env complete', async () => {
    const log = new CaptureLog();
    log.captureBook({
      venueId: 'v1',
      marketId: 'btc-usdt',
      connection: 'connected',
      snapshot: { sequence: 1, bids: [], asks: [] },
    });
    log.captureBook({
      venueId: 'v2',
      marketId: 'eth-usdt',
      connection: 'not_connected',
      snapshot: null,
    });

    const { client, queries } = mockSql();
    await expect(
      flushCaptureLogToPersistenceSink(
        log.records(),
        {
          CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
          CONNECT_DATA_LAKE_RETENTION_DAYS: '30',
        },
        { sql: client },
      ),
    ).resolves.toEqual({
      ok: true,
      recordCount: 2,
      writtenCount: 1,
      tsdbUrl: 'postgres://lake',
      retentionDays: 30,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.params?.[0]).toBe('v1');
    expect(queries[0]?.params?.[4]).toBe(1);
  });
});
