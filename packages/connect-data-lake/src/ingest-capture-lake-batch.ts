/**
 * Fabric capture batch ingest + persistence handoff (D-S-18 / §27:762).
 *
 * Ingests CaptureLake rows into the stage-1 log, then attempts persistence
 * flush through the owner-wired gate. No TSDB write in Stage-1 — refuse when
 * env is incomplete rather than silently dropping rows.
 */

import { CaptureLog, type CaptureRecord } from './capture.js';
import { ingestCaptureLakeRecords, type CaptureLakeRecord, type IngestCaptureLakeOptions } from './capture-lake-consumer.js';
import { flushCaptureLogToPersistenceSink, type PersistenceSinkResult } from './persistence-sink.js';

export type IngestCaptureLakeBatchResult = {
  readonly ingested: readonly CaptureRecord[];
  readonly persistence: PersistenceSinkResult;
};

export type IngestCaptureLakeBatchSummary = ReturnType<typeof describeIngestCaptureLakeBatch>;

/** Honesty board — batch ingest + persistence gate, no TSDB write in Stage-1. */
export function describeIngestCaptureLakeBatch(env: NodeJS.ProcessEnv = process.env) {
  const retention = env.CONNECT_DATA_LAKE_TSDB_URL?.trim() ?? '';
  const retentionDays = env.CONNECT_DATA_LAKE_RETENTION_DAYS?.trim() ?? '';
  return {
    ingestsFabricRecords: true as const,
    evaluatesPersistenceGate: true as const,
    writesTsdbInStage1: false as const,
    persistenceEnvComplete: retention.length > 0 && retentionDays.length > 0,
  };
}

/**
 * Ingest fabric capture facts, then evaluate persistence sink wiring on the full log.
 */
export function ingestCaptureLakeBatch(
  log: CaptureLog,
  records: readonly CaptureLakeRecord[],
  env: NodeJS.ProcessEnv = process.env,
  options: IngestCaptureLakeOptions = {},
): IngestCaptureLakeBatchResult {
  const ingested = ingestCaptureLakeRecords(log, records, options);
  const persistence = flushCaptureLogToPersistenceSink(log.records(), env);
  return { ingested, persistence };
}
