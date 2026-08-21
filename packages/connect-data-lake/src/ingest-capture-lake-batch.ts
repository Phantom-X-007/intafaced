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
