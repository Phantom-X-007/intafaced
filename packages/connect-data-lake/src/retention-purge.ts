/**
 * connect.data-lake retention purge — delete lake_ticks older than owner TTL.
 *
 * Refuse-closed when TSDB URL or retention days are unset. Never invents a TTL.
 */

import type { PersistenceSqlClient } from './postgres-persistence-sink.js';
import { retentionPersistenceGate, type DataLakeRetentionRefuseReason } from './retention-policy.js';

export type LakeRetentionPurgeRefuse = {
  readonly ok: false;
  readonly reason: DataLakeRetentionRefuseReason;
};

export type LakeRetentionPurgeOk = {
  readonly ok: true;
  readonly deletedCount: number;
  readonly cutoffIso: string;
  readonly retentionDays: number;
};

export type LakeRetentionPurgeResult = LakeRetentionPurgeRefuse | LakeRetentionPurgeOk;

const MS_PER_DAY = 86_400_000;

export function retentionCutoffIso(retentionDays: number, nowMs: number): string {
  return new Date(nowMs - retentionDays * MS_PER_DAY).toISOString();
}

/**
 * DELETE rows older than owner retention window. Absent env → refuse, not silent no-op.
 */
export async function purgeExpiredLakeTicks(
  client: PersistenceSqlClient,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): Promise<LakeRetentionPurgeResult> {
  const gate = retentionPersistenceGate(env);
  if (!gate.ok) {
    return { ok: false, reason: gate.reason };
  }

  const cutoffIso = retentionCutoffIso(gate.retentionDays, nowMs);
  const rows = (await client.unsafe('DELETE FROM connect_lake.lake_ticks WHERE captured_at < $1 RETURNING id', [cutoffIso])) as unknown;
  const deletedCount = Array.isArray(rows) ? rows.length : 0;

  return {
    ok: true,
    deletedCount,
    cutoffIso,
    retentionDays: gate.retentionDays,
  };
}
