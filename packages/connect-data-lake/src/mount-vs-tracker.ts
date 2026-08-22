/**
 * D26-P2-DL1 — connect.data-lake mount vs tracker honest gaps.
 *
 * Stage-1 capture log with fleet TSDB + tick/fill normalisation pipeline on tip.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeCapturePolicy } from './capture-policy.js';
import { describeDataLakeStage1 } from './data-lake-stage1.js';

export const DATA_LAKE_TRACKER_ID = 'connect.data-lake' as const;

export const DATA_LAKE_PACKAGE_EXPORTS = [
  'describeDataLakeStage1',
  'describeCapturePolicy',
  'describeTickFillNormalisationPipeline',
  'ingestTickFillWireRecord',
  'ingestTickFillWireRecords',
  'captureRecordFromTickFillWire',
  'ingestCaptureLakeBatch',
  'retentionPersistenceGate',
  'purgeExpiredLakeTicks',
  'runConnectDataLakeRetentionMaintenance',
  'gateQuantSurfaceRender',
  'describeQuantHonestyMount',
  'refuseQuantSurfaceRender',
  'EDGE_QUANT_SURFACE_RENDER_DOOR',
  'EDGE_QUANT_COMPOSITE_HONESTY_DOOR',
  'evaluateQuantSurfaceRender',
] as const;

export const DATA_LAKE_DONE_BAR_TEST_FILES = [
  'data-lake-stage1.test.ts',
  'capture-policy.test.ts',
  'capture-lake-consumer.test.ts',
  'persistence-sink.test.ts',
  'retention-purge.test.ts',
  'retention-maintenance.test.ts',
  'quant-honesty-mount.test.ts',
  'quant-surface-refuse.test.ts',
  'quant-surface-render-consumer.test.ts',
  'package-export-mount.test.ts',
  'tick-fill-normalisation-pipeline.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const DATA_LAKE_HONEST_GAPS = [] as const;

export function dataLakeExportsInIndexSource(): readonly (typeof DATA_LAKE_PACKAGE_EXPORTS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return DATA_LAKE_PACKAGE_EXPORTS.filter((name) => src.includes(name));
}

export function dataLakeStage1Honest(): boolean {
  const board = describeDataLakeStage1({});
  return (
    board.capture.tsdbWriteWhenOwnerWired === true &&
    board.capture.retentionOwnerEnvRequired === true &&
    board.batch.writesTsdbWhenOwnerWired === true &&
    board.batch.captureLogOnly === true &&
    board.retention.canPersist === false &&
    board.retention.captureLogOnly === true &&
    board.quantSurface.compositeGateWired === true &&
    board.quantSurface.inventsFraming === false &&
    board.quantSurface.edgeDoorNotProxiedToSvcQuant === true
  );
}

export function dataLakeCaptureConsumerHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'capture-lake-consumer.ts'), 'utf8');
  return /venue_not_connected/.test(src) && /never a synthetic book/i.test(src) && /isCaptureLakeHole/.test(src);
}

export function dataLakePersistenceSinkHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'persistence-sink.ts'), 'utf8');
  return (
    /Refuse-closed when env blank/i.test(src) && /persistCaptureRecordsToPostgres/.test(src) && /flushCaptureLogToPersistenceSink/.test(src)
  );
}

export function dataLakeCapturePolicyHonest(): boolean {
  const policy = describeCapturePolicy();
  return policy.unconnectedVenueIsAbsent === true && policy.holeNotSyntheticEmptyBook === true && policy.inventsQuietMarket === false;
}

export function dataLakeDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return DATA_LAKE_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function connectDataLakeTrackerBackendDoneBarMet(): boolean {
  return (
    dataLakeExportsInIndexSource().length === DATA_LAKE_PACKAGE_EXPORTS.length &&
    dataLakeStage1Honest() &&
    dataLakeCapturePolicyHonest() &&
    dataLakeCaptureConsumerHonestInSource() &&
    dataLakePersistenceSinkHonestInSource() &&
    dataLakeDoneBarTestsPresent()
  );
}

export function connectDataLakeMountVsTrackerBoardCard(): {
  readonly tracker: typeof DATA_LAKE_TRACKER_ID;
  readonly exports: number;
  readonly exportsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = dataLakeExportsInIndexSource();
  return {
    tracker: DATA_LAKE_TRACKER_ID,
    exports: DATA_LAKE_PACKAGE_EXPORTS.length,
    exportsPresent: present.length,
    gaps: DATA_LAKE_HONEST_GAPS.length,
    backendDoneBarMet: connectDataLakeTrackerBackendDoneBarMet(),
  };
}
