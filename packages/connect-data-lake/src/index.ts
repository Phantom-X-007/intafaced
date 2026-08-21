/**
 * @intafaced/connect-data-lake — Stage-1 in-process capture log (§27:762).
 *
 * Not a time-series store. Unconnected venues are absent, never empty books.
 */
export {
  CaptureLog,
  bookLevelsFromCapture,
  classifyBookObservation,
  isAbsentCapture,
  isMeasuredBook,
  type AbsentCapture,
  type AbsentReason,
  type BookObservation,
  type CaptureClock,
  type CaptureKind,
  type CaptureRecord,
  type FillObservation,
  type MeasuredBook,
  type MeasuredFill,
  type MeasuredTick,
  type TickObservation,
  type VenueConnection,
  type WireLevel,
} from './capture.js';
export {
  allowsMeasuredEmptyBook,
  allowsPersistenceClaim,
  CAPTURE_KINDS,
  describeCapturePolicy,
  wouldInventQuietMarket,
  type CapturePolicySummary,
} from './capture-policy.js';
export {
  describeDataLakeRetention,
  retentionPersistenceGate,
  type DataLakeRetentionGate,
  type DataLakeRetentionRefuseReason,
  type DataLakeRetentionSummary,
} from './retention-policy.js';
export {
  flushCaptureLogToPersistenceSink,
  type PersistenceSinkOk,
  type PersistenceSinkRefuse,
  type PersistenceSinkResult,
} from './persistence-sink.js';
export { ingestCaptureLakeBatch, type IngestCaptureLakeBatchResult } from './ingest-capture-lake-batch.js';
export {
  absentReasonFromCaptureLakeHole,
  bookLevelsFromLakeRecord,
  bookObservationFromLakeRecord,
  captureRecordFromLakeRecord,
  ingestCaptureLakeRecord,
  ingestCaptureLakeRecords,
  isCaptureLakeBook,
  isCaptureLakeHole,
  type CaptureLakeBookRecord,
  type CaptureLakeBookSnapshot,
  type CaptureLakeHoleReason,
  type CaptureLakeHoleRecord,
  type CaptureLakeRecord,
  type IngestCaptureLakeOptions,
} from './capture-lake-consumer.js';
