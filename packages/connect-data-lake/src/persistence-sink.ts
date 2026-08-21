/**
 * Persistence sink gate — connect.data-lake Stage-1 → TSDB handoff (D-S-18).
 *
 * Capture log stays in-process until owner wires TSDB + retention. This gate
 * refuses flush claims when env is incomplete — never a silent no-op persist.
 */

import type { CaptureRecord } from './capture.js';
import { retentionPersistenceGate, type DataLakeRetentionRefuseReason } from './retention-policy.js';

export type PersistenceSinkRefuse = {
  readonly ok: false;
  readonly reason: DataLakeRetentionRefuseReason;
};

export type PersistenceSinkOk = {
  readonly ok: true;
  readonly recordCount: number;
  readonly tsdbUrl: string;
  readonly retentionDays: number;
};

export type PersistenceSinkResult = PersistenceSinkRefuse | PersistenceSinkOk;

/**
 * Attempt to hand capture rows to persistence. Stage-1 performs no TSDB write —
 * it only validates owner wiring and reports how many rows would flush.
 */
export function flushCaptureLogToPersistenceSink(
  records: readonly CaptureRecord[],
  env: NodeJS.ProcessEnv = process.env,
): PersistenceSinkResult {
  const gate = retentionPersistenceGate(env);
  if (!gate.ok) {
    return { ok: false, reason: gate.reason };
  }
  return {
    ok: true,
    recordCount: records.length,
    tsdbUrl: gate.tsdbUrl,
    retentionDays: gate.retentionDays,
  };
}
