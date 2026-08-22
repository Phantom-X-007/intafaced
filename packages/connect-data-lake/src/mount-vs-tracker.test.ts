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

describe('connect.data-lake stage1 and capture honesty complete (D68)', () => {
  it('dataLakeStage1Honest and capture policy honesty lock full stage1 board', () => {
    const board = describeDataLakeStage1({});
    expect(board.capture.tsdbWriteWhenOwnerWired).toBe(true);
    expect(board.capture.retentionOwnerEnvRequired).toBe(true);
    expect(board.batch.captureLogOnly).toBe(true);
    expect(board.retention.captureLogOnly).toBe(true);
    expect(board.quantSurface.compositeGateWired).toBe(true);
    expect(board.quantSurface.inventsFraming).toBe(false);
    expect(board.quantSurface.edgeDoorNotProxiedToSvcQuant).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake package exports complete (D69)', () => {
  it('dataLakeExportsInIndexSource lists every DATA_LAKE_PACKAGE_EXPORT on index', () => {
    const exports = dataLakeExportsInIndexSource();
    expect(exports).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(exports).toContain('ingestCaptureLakeBatch');
    expect(exports).toContain('runConnectDataLakeRetentionMaintenance');
    expect(exports).toContain('evaluateQuantSurfaceRender');
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard()).toMatchObject({
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      backendDoneBarMet: true,
    });
  });
});

describe('connect.data-lake done bar files complete (D71)', () => {
  it('dataLakeDoneBarTestsPresent locks every DATA_LAKE_DONE_BAR_TEST_FILE on disk', () => {
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(DATA_LAKE_DONE_BAR_TEST_FILES).toHaveLength(11);
    expect(DATA_LAKE_DONE_BAR_TEST_FILES).toContain('mount-vs-tracker.test.ts');
    expect(DATA_LAKE_DONE_BAR_TEST_FILES).toContain('quant-honesty-mount.test.ts');
    expect(DATA_LAKE_DONE_BAR_TEST_FILES).toContain('capture-policy.test.ts');
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});

describe('connect.data-lake mount vs tracker — D73 denon audit complete', () => {
  it('backend done bar met; honest gaps remain owner-residual across denon WIP lanes', () => {
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard()).toMatchObject({
      tracker: 'connect.data-lake',
      gaps: 3,
      backendDoneBarMet: true,
    });
  });
});

describe('connect.data-lake mount vs tracker — D74 denon complete', () => {
  it('stage1, capture, persistence, exports, done-bar tests, and honest gaps board all green', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D76 denon complete', () => {
  it('full mount board: tracker, exports, stage1 quant surface, capture, persistence, honest gaps', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.tracker).toBe('connect.data-lake');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.exportsPresent).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(card.gaps).toBe(3);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    const board = describeDataLakeStage1({});
    expect(board.quantSurface.compositeGateWired).toBe(true);
    expect(board.quantSurface.inventsFraming).toBe(false);
    expect(board.batch.captureLogOnly).toBe(true);
    expect(board.retention.captureLogOnly).toBe(true);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
  });
});

describe('connect.data-lake mount vs tracker — D78 denon complete', () => {
  it('full mount board: capture policy, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D80 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.tracker).toBe('connect.data-lake');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.exportsPresent).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(card.gaps).toBe(DATA_LAKE_HONEST_GAPS.length);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
  });
});

describe('connect.data-lake mount vs tracker — D82 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D84 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.tracker).toBe('connect.data-lake');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.exportsPresent).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(card.gaps).toBe(DATA_LAKE_HONEST_GAPS.length);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
  });
});

describe('connect.data-lake mount vs tracker — D86 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D88 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card.tracker).toBe('connect.data-lake');
    expect(card.backendDoneBarMet).toBe(true);
    expect(card.exportsPresent).toBe(DATA_LAKE_PACKAGE_EXPORTS.length);
    expect(card.gaps).toBe(DATA_LAKE_HONEST_GAPS.length);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toEqual(['gap.no_tsdb_compose', 'gap.tick_fill_normalisation_pipeline', 'gap.retention_owner_env']);
  });
});

describe('connect.data-lake mount vs tracker — D90 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D92 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D94 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});

describe('connect.data-lake mount vs tracker — D96 denon complete', () => {
  it('full mount board: stage1, capture, persistence, exports, done-bar tests, honest gaps', () => {
    expect(DATA_LAKE_TRACKER_ID).toBe('connect.data-lake');
    const card = connectDataLakeMountVsTrackerBoardCard();
    expect(card).toMatchObject({
      tracker: 'connect.data-lake',
      exports: DATA_LAKE_PACKAGE_EXPORTS.length,
      exportsPresent: DATA_LAKE_PACKAGE_EXPORTS.length,
      gaps: DATA_LAKE_HONEST_GAPS.length,
      backendDoneBarMet: true,
    });
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(dataLakeStage1Honest()).toBe(true);
    expect(dataLakeCapturePolicyHonest()).toBe(true);
    expect(dataLakeCaptureConsumerHonestInSource()).toBe(true);
    expect(dataLakePersistenceSinkHonestInSource()).toBe(true);
    expect(dataLakeDoneBarTestsPresent()).toBe(true);
    expect(dataLakeExportsInIndexSource()).toEqual([...DATA_LAKE_PACKAGE_EXPORTS]);
    expect(DATA_LAKE_HONEST_GAPS).toHaveLength(3);
  });
});
