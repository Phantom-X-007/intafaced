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
  assessStrategyComparisonOrder,
  buildPerformanceContextLabels,
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
  type RenderableBacktestSurface,
  type SlippageModelKind,
  type StrategyComparisonOrder,
  type StrategyComparisonOrderAssessment,
} from './quant-honesty.js';
