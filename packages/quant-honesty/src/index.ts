/**
 * @intafaced/quant-honesty — §29 contract and refusal boundary.
 *
 * No engine, data lake, return calculation, or user surface lives here.
 */
export {
  ALLOWED_STRATEGY_COMPARISON_ORDERS,
  FEE_MODEL_KINDS,
  LATENCY_MODEL_KINDS,
  OUT_OF_SAMPLE_STATUSES,
  SLIPPAGE_MODEL_KINDS,
  assessBacktestSurface,
  assessSimulatedNotLive,
  assessStrategyComparisonOrder,
  buildPerformanceContextLabels,
  QUANT_PERFORMANCE_ENVIRONMENTS,
  SIMULATED_PERFORMANCE_ENVIRONMENTS,
  type BacktestCostDisclosure,
  type BacktestCostModel,
  type BacktestSurfaceAssessment,
  type BacktestSurfaceCandidate,
  type BacktestSurfaceRefusal,
  type BacktestSurfaceRefusalCode,
  type CostModelEvidence,
  type FeeModelKind,
  type LatencyModelKind,
  type OutOfSampleStatus,
  type OutOfSampleVerdict,
  type PerformanceContextLabel,
  type QuantPerformanceEnvironment,
  type RenderableBacktestSurface,
  type SimulatedClaimLabel,
  type SimulatedNotLiveAssessment,
  type SimulatedNotLiveRefusalCode,
  type SimulatedPerformanceEnvironment,
  type SimulatedPerformanceStamp,
  type SlippageModelKind,
  type StrategyComparisonOrder,
  type StrategyComparisonOrderAssessment,
} from './quant-honesty.js';
export {
  QUANT_BACKTEST_HONEST_GAPS,
  QUANT_BACKTEST_TRACKER_ID,
  quantBacktestEventEnginePresent,
  quantBacktestMountVsTrackerBoardCard,
  quantBacktestTrackerBackendDoneBarMet,
} from './quant-backtest-mount-vs-tracker.js';
export {
  QUANT_STUDIO_HONEST_GAPS,
  QUANT_STUDIO_TRACKER_ID,
  quantStudioMountVsTrackerBoardCard,
  quantStudioTrackerBackendDoneBarMet,
  quantStudioVisualBuilderPresent,
} from './quant-studio-mount-vs-tracker.js';
