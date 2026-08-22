/**
 * connect.data-lake retention maintenance — operator job entry (D30).
 *
 * Wraps purgeExpiredLakeTicks for scheduled/cron invocation. Refuse-closed when
 * owner env incomplete — never silent no-op pretending retention ran.
 */

import type { PersistenceSqlClient } from './postgres-persistence-sink.js';
import { retentionPersistenceGate } from './retention-policy.js';
import { purgeExpiredLakeTicks, type LakeRetentionPurgeResult } from './retention-purge.js';

export type RetentionMaintenanceSummary = {
  readonly canRun: boolean;
  readonly captureLogOnly: boolean;
  readonly retentionDays: number | null;
};

export function describeRetentionMaintenance(env: NodeJS.ProcessEnv = process.env): RetentionMaintenanceSummary {
  const gate = retentionPersistenceGate(env);
  return {
    canRun: gate.ok,
    captureLogOnly: !gate.ok,
    retentionDays: gate.ok ? gate.retentionDays : null,
  };
}

/** Operator/cron entry — DELETE expired lake_ticks or refuse with reason. */
export async function runConnectDataLakeRetentionMaintenance(
  client: PersistenceSqlClient,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): Promise<LakeRetentionPurgeResult> {
  return purgeExpiredLakeTicks(client, env, nowMs);
}
