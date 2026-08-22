import { describe, expect, it } from 'vitest';
import type { PersistenceSqlClient } from './postgres-persistence-sink.js';
import { purgeExpiredLakeTicks, retentionCutoffIso } from './retention-purge.js';

function mockSql(deletedIds: number[] = []): PersistenceSqlClient {
  return {
    async unsafe(query, params) {
      expect(query).toContain('DELETE FROM connect_lake.lake_ticks');
      expect(params?.[0]).toBeTruthy();
      return deletedIds.map((id) => ({ id }));
    },
  };
}

describe('purgeExpiredLakeTicks', () => {
  it('refuses when TSDB env unset', async () => {
    await expect(purgeExpiredLakeTicks(mockSql(), {})).resolves.toEqual({ ok: false, reason: 'no_tsdb' });
  });

  it('refuses when retention days unset', async () => {
    await expect(purgeExpiredLakeTicks(mockSql(), { CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake' })).resolves.toEqual({
      ok: false,
      reason: 'no_retention_policy',
    });
  });

  it('DELETEs rows older than owner retention window', async () => {
    const nowMs = Date.parse('2026-08-22T00:00:00.000Z');
    const env = {
      CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
      CONNECT_DATA_LAKE_RETENTION_DAYS: '7',
    };
    const cutoffIso = retentionCutoffIso(7, nowMs);
    expect(cutoffIso).toBe('2026-08-15T00:00:00.000Z');

    await expect(purgeExpiredLakeTicks(mockSql([1, 2, 3]), env, nowMs)).resolves.toEqual({
      ok: true,
      deletedCount: 3,
      cutoffIso,
      retentionDays: 7,
    });
  });
});
