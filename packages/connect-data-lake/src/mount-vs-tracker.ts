/**
 * D26-P2-DL1 — connect.data-lake mount vs tracker honest gaps.
 *
 * Stage-1 capture log only — no TSDB write, no invented quiet market.
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
  'ingestCaptureLakeBatch',
  'retentionPersistenceGate',
] as const;

export const DATA_LAKE_DONE_BAR_TEST_FILES = [
  'data-lake-stage1.test.ts',
  'capture-policy.test.ts',
  'package-export-mount.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const DATA_LAKE_HONEST_GAPS = [
  'gap.no_tsdb_compose',
  'gap.tick_fill_normalisation_pipeline',
  'gap.retention_owner_unchosen',
] as const;

export function dataLakeExportsInIndexSource(): readonly (typeof DATA_LAKE_PACKAGE_EXPORTS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'index.ts'), 'utf8');
  return DATA_LAKE_PACKAGE_EXPORTS.filter((name) => src.includes(name));
}

export function dataLakeStage1Honest(): boolean {
  const board = describeDataLakeStage1({});
  return (
    board.capture.noTsdbInPackage === true &&
    board.batch.writesTsdbInStage1 === false &&
    board.retention.canPersist === false &&
    board.retention.captureLogOnly === true
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
