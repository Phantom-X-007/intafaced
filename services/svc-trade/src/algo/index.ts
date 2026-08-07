/**
 * Algo module public surface (D-S-04 TWAP Stage).
 * Reachability: imported by TradeService + router.
 */
export { TwapEngine, type TwapEnginePorts, type PlaceChildRequest, type PlaceChildResult, type SliceTickResult } from './twap-engine.js';
export { planTwapSlices, type TwapSlicePlan } from './schedule.js';
export {
  acceptableForAlgo,
  algoMarkMissing,
  withinPriceBand,
  DEFAULT_ALGO_MARK_POLICY,
  ALGO_MARK_MISSING,
  ALGO_MARK_UNUSABLE,
  ALGO_MARK_INVALID,
} from './mark-gate.js';
export { presentAlgoProgress, assertParentHasNoMoneyFields, FORBIDDEN_PARENT_MONEY_KEYS } from './present.js';
export type {
  TwapParent,
  AlgoProgressView,
  CreateTwapInput,
  AlgoQuotedMark,
  AlgoMiss,
  AlgoChildRef,
  AlgoStatus,
  AlgoKind,
} from './types.js';
