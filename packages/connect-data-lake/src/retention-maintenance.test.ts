import { describe, expect, it } from 'vitest';
import type { PersistenceSqlClient } from './postgres-persistence-sink.js';
import { describeRetentionMaintenance, runConnectDataLakeRetentionMaintenance } from './retention-maintenance.js';

function mockSql(deleted = 0): PersistenceSqlClient {
  return {
    async unsafe() {
      return Array.from({ length: deleted }, (_, i) => ({ id: i + 1 }));
    },
  };
}

describe('runConnectDataLakeRetentionMaintenance', () => {
  it('describeRetentionMaintenance is capture-log-only when env incomplete', () => {
    expect(describeRetentionMaintenance({})).toEqual({
      canRun: false,
      captureLogOnly: true,
      retentionDays: null,
    });
  });

  it('refuses maintenance when retention env incomplete', async () => {
    await expect(runConnectDataLakeRetentionMaintenance(mockSql(), {})).resolves.toEqual({
      ok: false,
      reason: 'no_tsdb',
    });
  });

  it('runs purge when owner env complete', async () => {
    const env = {
      CONNECT_DATA_LAKE_TSDB_URL: 'postgres://lake',
      CONNECT_DATA_LAKE_RETENTION_DAYS: '14',
    };
    expect(describeRetentionMaintenance(env)).toEqual({
      canRun: true,
      captureLogOnly: false,
      retentionDays: 14,
    });
    await expect(runConnectDataLakeRetentionMaintenance(mockSql(2), env)).resolves.toMatchObject({
      ok: true,
      deletedCount: 2,
      retentionDays: 14,
    });
  });
});
