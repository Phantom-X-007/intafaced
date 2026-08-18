import { describe, expect, it, vi } from 'vitest';
import { startEngineLedgerReconcileJobs } from './engine-ledger-reconcile-jobs.js';

function emptyReport() {
  return {
    checked: 0,
    agreed: 0,
    findings: [] as const,
    refusals: 0,
    ok: true,
  };
}

describe('startEngineLedgerReconcileJobs', () => {
  it('disabled: host exists, no job scheduled', () => {
    const reconcile = vi.fn();
    const handle = startEngineLedgerReconcileJobs({
      sql: {} as never,
      ledger: { balance: vi.fn() },
      matching: { reconcile, listMarkets: vi.fn(async () => ({ markets: [] })) },
      config: { enabled: false, intervalMs: 60_000 },
    });
    expect(handle.host.list()).toEqual([]);
    expect(reconcile).not.toHaveBeenCalled();
    handle.stop();
  });

  it('enabled: registers one job name', () => {
    const handle = startEngineLedgerReconcileJobs({
      sql: Object.assign(async () => [], {}) as never,
      ledger: {
        balance: vi.fn(async () => ({
          account: { ownerType: 'user' as const, ownerId: 'u', assetId: 'USDT', kind: 'hold' as const },
          accountId: 'a',
          amount: 0n,
        })),
      },
      matching: {
        listMarkets: vi.fn(async () => ({ markets: [] })),
        reconcile: vi.fn(async () => emptyReport()),
      },
      config: { enabled: true, intervalMs: 60_000 },
    });
    expect(handle.host.list()).toEqual(['trade.engine_ledger_reconcile']);
    handle.stop();
    expect(handle.host.list()).toEqual([]);
  });

  it('enabled tick drives reconcile once per interval', async () => {
    vi.useFakeTimers();
    try {
      const reconcile = vi.fn(async () => emptyReport());
      const listMarkets = vi.fn(async () => ({ markets: [] as string[] }));
      const onResult = vi.fn();
      const handle = startEngineLedgerReconcileJobs({
        sql: Object.assign(async () => [], {}) as never,
        ledger: {
          balance: vi.fn(async () => ({
            account: { ownerType: 'user' as const, ownerId: 'u', assetId: 'USDT', kind: 'hold' as const },
            accountId: 'a',
            amount: 0n,
          })),
        },
        matching: { reconcile, listMarkets },
        config: { enabled: true, intervalMs: 5_000 },
        onResult,
      });

      expect(reconcile).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(listMarkets).toHaveBeenCalledTimes(1);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(onResult.mock.calls[0]![0].marketIdDrift.drifted).toBe(false);
      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
