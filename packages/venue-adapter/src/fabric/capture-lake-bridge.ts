/**
 * Fabric CaptureLake → @intafaced/connect-data-lake CaptureLog.
 *
 * One-way bridge: venue-adapter may depend on connect-data-lake; the inverse
 * would cycle (connect-data-lake documents the twin types without importing here).
 */
import {
  CaptureLog,
  ingestCaptureLakeBatch,
  type IngestCaptureLakeBatchResult,
  ingestCaptureLakeRecord,
  ingestCaptureLakeRecords,
  type CaptureLakeRecord,
  type IngestCaptureLakeOptions,
} from '@intafaced/connect-data-lake';
import type { CaptureLake, CaptureRecord } from './capture-lake.js';

function fabricRecordToConnectLakeRecord(record: CaptureRecord): CaptureLakeRecord {
  if (record.kind === 'hole') {
    return {
      kind: 'hole',
      venueId: record.venueId,
      symbol: record.symbol,
      capturedAt: record.capturedAt,
      reason: record.reason,
      detail: record.detail,
    };
  }

  const { snapshot } = record;
  return {
    kind: 'book',
    venueId: record.venueId,
    symbol: record.symbol,
    capturedAt: record.capturedAt,
    snapshot: {
      venueId: snapshot.venueId,
      symbol: snapshot.symbol,
      sequence: snapshot.sequence,
      sequenced: snapshot.sequenced,
      observedAt: snapshot.observedAt,
      bids: snapshot.bids,
      asks: snapshot.asks,
    },
  };
}

/** Append one fabric capture fact into a stage-1 connect log with hole honesty. */
export function ingestFabricCaptureRecord(
  log: CaptureLog,
  record: CaptureRecord,
  options: IngestCaptureLakeOptions = {},
): ReturnType<typeof ingestCaptureLakeRecord> {
  return ingestCaptureLakeRecord(log, fabricRecordToConnectLakeRecord(record), options);
}

/** Drain an in-memory fabric lake into connect-data-lake in append order. */
export function drainFabricCaptureLakeToLog(
  lake: CaptureLake,
  log: CaptureLog,
  options: IngestCaptureLakeOptions = {},
): ReturnType<typeof ingestCaptureLakeRecords> {
  return ingestCaptureLakeRecords(log, lake.records().map(fabricRecordToConnectLakeRecord), options);
}

/** Stage-1 log + persistence flush when owner TSDB + retention env are both set (P-08). */
export async function drainFabricCaptureLakeToPersistence(
  lake: CaptureLake,
  env: NodeJS.ProcessEnv = process.env,
  options: IngestCaptureLakeOptions = {},
): Promise<IngestCaptureLakeBatchResult> {
  const log = new CaptureLog();
  drainFabricCaptureLakeToLog(lake, log, options);
  return ingestCaptureLakeBatch(log, [], env);
}

export { fabricRecordToConnectLakeRecord };
