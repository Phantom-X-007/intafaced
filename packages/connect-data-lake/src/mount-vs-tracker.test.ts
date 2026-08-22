import { describe, expect, it } from 'vitest';
import {
  connectDataLakeMountVsTrackerBoardCard,
  connectDataLakeTrackerBackendDoneBarMet,
  DATA_LAKE_DONE_BAR_TEST_FILES,
  DATA_LAKE_HONEST_GAPS,
  DATA_LAKE_PACKAGE_EXPORTS,
  DATA_LAKE_TRACKER_ID,
  dataLakeCaptureConsumerHonestInSource,
  dataLakeCapturePolicyHonest,
  dataLakeDoneBarTestsPresent,
  dataLakeExportsInIndexSource,
  dataLakePersistenceSinkHonestInSource,
  dataLakeStage1Honest,
} from './mount-vs-tracker.js';
import { describeDataLakeStage1 } from './data-lake-stage1.js';

describe('connect.data-lake mount vs tracker honest gaps (D26-P2-DL1)', () => {
  it('Stage-1 backend done bar met on tip — owner-wired TSDB, refuse when blank', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake mount vs tracker gaps board (D53)', () => {
  it('connectDataLakeMountVsTrackerBoardCard names honest gaps without flipping backend done bar', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.gaps).toBe(DATA_LAKE_HONEST_GAPS.length);
    expect(card.backendDoneBarMet).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
  });
});

describe('connect.data-lake capture honesty mount (D55)', () => {
  it('capture policy, consumer, and persistence sink honesty without flipping backend done bar', () => {
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake done bar test files (D56)', () => {
  it('dataLakeDoneBarTestsPresent locks all DATA_LAKE_DONE_BAR_TEST_FILES on disk', () => {
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(DATA_LAKE_DONE_BAR_TEST_FILES).toEqual([
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
      'mount-vs-tracker.test.ts',
    ]);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake package exports board (D58)', () => {
  it('connectDataLakeMountVsTrackerBoardCard reports all package exports present', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.exports).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(card.exportsPresent).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(card.backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake stage1 honesty mount (D60)', () => {
  it('dataLakeStage1Honest locks describeDataLakeStage1 board without flipping backend done bar', () => {
    const board = describeDataLakeStage1({});
    expect(dataLakeStage1Honest()).toBe(true);
    expect(board.quantSurface.compositeGateWired).toBe(true);
    expect(board.quantSurface.inventsFraming).toBe(false);
    expect(board.capture.inventsQuietMarket).toBe(false);
    expect(board.retention.captureLogOnly).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
  });
});

describe('connect.data-lake tracker backend done bar complete (D62)', () => {
  it('connectDataLakeTrackerBackendDoneBarMet requires exports, stage1, capture, and done bar tests', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    expect(dataLakeExportsInIndexSource().length).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake quant edge doors in exports (D64)', () => {
  it('package exports wire EDGE_QUANT surface render and composite honesty doors', () => {
    const exports = dataLakeExportsInIndexSource();
    expect(exports).toContain('EDGE_QUANT_SURFACE_RENDER_DOOR');
    expect(exports).toContain('EDGE_QUANT_COMPOSITE_HONESTY_DOOR');
    expect(exports).toContain('describeQuantHonestyMount');
    expect(exports).toContain('gateQuantSurfaceRender');
    expect(exports).toContain('refuseQuantSurfaceRender');
    const board = describeDataLakeStage1({});
    expect(board.quantSurface.edgeDoorNotProxiedToSvcQuant).toBe(true);
    expect(board.quantSurface.compositeGateWired).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake mount vs tracker board complete (D66)', () => {
  it('connectDataLakeMountVsTrackerBoardCard reports exports, gaps, and backend done bar met', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.tracker).toBe('connect.data-lake');
    expect(card.exportsPresent).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(card.gaps).toBe(DATA_LAKE_HONEST_GAPS.length);
    expect(card.backendDoneBarMet).toBe(true);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
  });
});
