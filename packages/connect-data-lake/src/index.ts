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
  type PersistenceSinkDeps,
  type PersistenceSinkOk,
  type PersistenceSinkRefuse,
  type PersistenceSinkResult,
} from './persistence-sink.js';
export {
  purgeExpiredLakeTicks,
  retentionCutoffIso,
  type LakeRetentionPurgeOk,
  type LakeRetentionPurgeRefuse,
  type LakeRetentionPurgeResult,
} from './retention-purge.js';
export {
  describeRetentionMaintenance,
  runConnectDataLakeRetentionMaintenance,
  type RetentionMaintenanceSummary,
} from './retention-maintenance.js';
export {
  lakeTickRowsFromCaptureRecords,
  persistCaptureRecordsToPostgres,
  type LakeTickInsertRow,
  type PersistenceSqlClient,
} from './postgres-persistence-sink.js';
export {
  describeIngestCaptureLakeBatch,
  ingestCaptureLakeBatch,
  type IngestCaptureLakeBatchResult,
  type IngestCaptureLakeBatchSummary,
} from './ingest-capture-lake-batch.js';
export { describeDataLakeStage1, type DataLakeStage1Summary } from './data-lake-stage1.js';
export {
  describeQuantHonestyPolicy,
  gateBacktestRender,
  gateLiveVsBacktestCompare,
  gateReturnsLeaderboard,
  type BacktestCostModel,
  type BacktestRenderGate,
  type BacktestRenderInput,
  type OutOfSampleVerdict,
  type QuantHonestyRefuseReason,
  type ReturnsLeaderboardInput,
} from './quant-honesty-policy.js';
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
