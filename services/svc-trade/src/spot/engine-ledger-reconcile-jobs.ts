/**
 * Scheduled host for engine ↔ ledger reconcile (A10).
 *
 * Default OFF. Same job-host pattern as candle / futures / algo jobs.
 * When enabled: builds the trade counterpart view, POSTs matching `/reconcile`,
 * auto-deletes only unfunded pending intents, and **writes nothing on refuse**.
 *
 * Refuse findings are operator alerts — stranded money is named, not "fixed".
 */
import type { Sql } from 'postgres';
import type { LedgerClient } from '@intafaced/ledger-client';
import { createJobHost, type JobHost } from '../futures/job-host.js';
import type { CounterpartOrder, ReconcileReport } from './matching-client.js';
import { runEngineLedgerReconcileTick, type EngineLedgerReconcileTickResult } from './engine-ledger-reconcile.js';

export interface EngineLedgerReconcileJobsConfig {
  /** Master kill — false = host created, no intervals. */
  enabled: boolean;
  /** Tick interval when enabled. */
  intervalMs: number;
  /** When true (default), DELETE unfunded pending auto findings. */
  autoDeleteUnfundedPending?: boolean;
}

export interface EngineLedgerReconcileJobsDeps {
  sql: Sql;
  ledger: Pick<LedgerClient, 'balance'>;
  matching: {
    reconcile(orders: readonly CounterpartOrder[]): Promise<ReconcileReport>;
  };
  config: EngineLedgerReconcileJobsConfig;
  onError?: (name: string, err: unknown) => void;
  onResult?: (result: EngineLedgerReconcileTickResult) => void;
}

export interface EngineLedgerReconcileJobsHandle {
  host: JobHost;
  stop(): void;
}

/** Assemble the reconcile sweep. Disabled → stopped host, no intervals. */
export function startEngineLedgerReconcileJobs(deps: EngineLedgerReconcileJobsDeps): EngineLedgerReconcileJobsHandle {
  const host = createJobHost({ onError: deps.onError });

  if (!deps.config.enabled) {
    return { host, stop: () => host.stopAll() };
  }

  host.every('trade.engine_ledger_reconcile', deps.config.intervalMs, async () => {
    const result = await runEngineLedgerReconcileTick({
      sql: deps.sql,
      ledger: deps.ledger,
      matching: deps.matching,
      autoDeleteUnfundedPending: deps.config.autoDeleteUnfundedPending !== false,
    });
    deps.onResult?.(result);
  });

  return { host, stop: () => host.stopAll() };
}
