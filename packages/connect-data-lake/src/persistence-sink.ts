/**
 * Persistence sink gate — connect.data-lake capture log → TSDB (D-S-18 / D27-P4).
 *
 * Refuses flush when owner env is incomplete. When TSDB URL and retention days
 * are both set, measured rows INSERT into connect_lake.lake_ticks.
 */

import type { CaptureRecord } from './capture.js';
import { persistCaptureRecordsToPostgres, type PersistenceSqlClient } from './postgres-persistence-sink.js';
import { retentionPersistenceGate, type DataLakeRetentionRefuseReason } from './retention-policy.js';

export type PersistenceSinkRefuse = {
  readonly ok: false;
  readonly reason: DataLakeRetentionRefuseReason;
};

export type PersistenceSinkOk = {
  readonly ok: true;
  readonly recordCount: number;
  readonly writtenCount: number;
  readonly tsdbUrl: string;
  readonly retentionDays: number;
};

export type PersistenceSinkResult = PersistenceSinkRefuse | PersistenceSinkOk;

export type PersistenceSinkDeps = {
  /** Injectable postgres client for tests — omit to connect from tsdbUrl. */
  readonly sql?: PersistenceSqlClient;
  /** Factory when sql is omitted. Defaults to postgres npm client. */
  readonly connect?: (url: string) => Promise<PersistenceSqlClient>;
};

async function defaultConnect(url: string): Promise<PersistenceSqlClient> {
  const { default: postgres } = await import('postgres');
  return postgres(url, { max: 1, onnotice: () => undefined });
}

/**
 * Hand capture rows to persistence. Refuse-closed when env blank; otherwise
 * INSERT measured rows. Absent rows are never written.
 */
export async function flushCaptureLogToPersistenceSink(
  records: readonly CaptureRecord[],
  env: NodeJS.ProcessEnv = process.env,
  deps: PersistenceSinkDeps = {},
): Promise<PersistenceSinkResult> {
  const gate = retentionPersistenceGate(env);
  if (!gate.ok) {
    return { ok: false, reason: gate.reason };
  }

  const ownedClient = deps.sql === undefined;
  const client = deps.sql ?? (await (deps.connect ?? defaultConnect)(gate.tsdbUrl));
  try {
    const writtenCount = await persistCaptureRecordsToPostgres(records, client);
    return {
      ok: true,
      recordCount: records.length,
      writtenCount,
      tsdbUrl: gate.tsdbUrl,
      retentionDays: gate.retentionDays,
    };
  } finally {
    if (ownedClient) {
      await client.end?.({ timeout: 1 });
    }
  }
}
