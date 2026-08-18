import { describe, expect, it } from 'vitest';
import { ANALYTICS_REPLICA_LAG_SQL } from '@intafaced/contracts';
import { createEdgeWarehouseLagProbe, warehouseLagProbeEnabled } from './analytics-lag-probe.js';

describe('createEdgeWarehouseLagProbe', () => {
  it('ANALYTICS_REPLICA_PROBE=off disables the production caller', () => {
    expect(warehouseLagProbeEnabled({ ANALYTICS_REPLICA_PROBE: 'off' })).toBe(false);
    expect(warehouseLagProbeEnabled({})).toBe(true);
  });

  it('runs ANALYTICS_REPLICA_LAG_SQL through the injected client and ends it', async () => {
    const ended: number[] = [];
    const sqls: string[] = [];
    const probe = createEdgeWarehouseLagProbe((url) => {
      expect(url).toContain('analytics_ro');
      return {
        unsafe(sql) {
          sqls.push(sql);
          return [{ lag_seconds: 7 }];
        },
        end() {
          ended.push(1);
        },
      };
    });

    const reading = await probe({
      endpoints: [{ source: 'ledger', url: 'postgres://analytics_ro:x@replica:5432/ledger', username: 'analytics_ro' }],
      nowMs: 42,
    });

    expect(sqls).toEqual([ANALYTICS_REPLICA_LAG_SQL]);
    expect(ended).toEqual([1]);
    expect(reading).toEqual({ lagSeconds: 7, measuredAt: 42 });
  });

  it('connect throw → null measurement (unknown, not invented 0)', async () => {
    const probe = createEdgeWarehouseLagProbe(() => {
      throw new Error('ECONNREFUSED');
    });
    const reading = await probe({
      endpoints: [{ source: 'ledger', url: 'postgres://analytics_ro:x@replica:5432/ledger', username: 'analytics_ro' }],
      nowMs: 1,
    });
    expect(reading).toBeNull();
  });
});
