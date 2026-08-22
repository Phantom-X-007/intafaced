/**
 * Fabric capture batch ingest + persistence handoff (D-S-18 / §27:762).
 *
 * Ingests CaptureLake rows into the stage-1 log, then attempts persistence
 * flush through the owner-wired gate. Refuse when env is incomplete; INSERT
 * measured rows when TSDB URL and retention days are both owner-set.
 */

import { CaptureLog, type CaptureRecord } from './capture.js';
import { ingestCaptureLakeRecords, type CaptureLakeRecord, type IngestCaptureLakeOptions } from './capture-lake-consumer.js';
import { flushCaptureLogToPersistenceSink, type PersistenceSinkResult } from './persistence-sink.js';

export type IngestCaptureLakeBatchResult = {
  readonly ingested: readonly CaptureRecord[];
  readonly persistence: PersistenceSinkResult;
};

export type IngestCaptureLakeBatchSummary = ReturnType<typeof describeIngestCaptureLakeBatch>;

/** Honesty board — batch ingest + persistence gate. */
export function describeIngestCaptureLakeBatch(env: NodeJS.ProcessEnv = process.env) {
  const tsdbUrl = env.CONNECT_DATA_LAKE_TSDB_URL?.trim() ?? '';
  const retentionDays = env.CONNECT_DATA_LAKE_RETENTION_DAYS?.trim() ?? '';
  const persistenceEnvComplete = tsdbUrl.length > 0 && retentionDays.length > 0;
  return {
    ingestsFabricRecords: true as const,
    evaluatesPersistenceGate: true as const,
    writesTsdbWhenOwnerWired: true as const,
    persistenceEnvComplete,
    captureLogOnly: !persistenceEnvComplete,
  };
}

/**
 * Ingest fabric capture facts, then evaluate persistence sink wiring on the full log.
 */
export async function ingestCaptureLakeBatch(
  log: CaptureLog,
  records: readonly CaptureLakeRecord[],
  env: NodeJS.ProcessEnv = process.env,
  options: IngestCaptureLakeOptions = {},
  deps: Parameters<typeof flushCaptureLogToPersistenceSink>[2] = {},
): Promise<IngestCaptureLakeBatchResult> {
  const ingested = ingestCaptureLakeRecords(log, records, options);
  const persistence = await flushCaptureLogToPersistenceSink(log.records(), env, deps);
  return { ingested, persistence };
}
