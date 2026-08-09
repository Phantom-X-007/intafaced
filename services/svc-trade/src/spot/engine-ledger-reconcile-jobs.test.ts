import { describe, expect, it, vi } from 'vitest';
import { startEngineLedgerReconcileJobs } from './engine-ledger-reconcile-jobs.js';

describe('startEngineLedgerReconcileJobs', () => {
  it('disabled: host exists, no job scheduled', () => {
    const reconcile = vi.fn();
    const handle = startEngineLedgerReconcileJobs({
      sql: {} as never,
      ledger: { balance: vi.fn() },
      matching: { reconcile },
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
        reconcile: vi.fn(async () => ({
          checked: 0,
          agreed: 0,
          findings: [],
          refusals: 0,
          ok: true,
        })),
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
      const reconcile = vi.fn(async () => ({
        checked: 0,
        agreed: 0,
        findings: [],
        refusals: 0,
        ok: true,
      }));
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
        matching: { reconcile },
        config: { enabled: true, intervalMs: 5_000 },
        onResult,
      });

      expect(reconcile).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledTimes(1);
      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
