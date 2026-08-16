/**
 * Quant Studio reachability — mandatory risk blocks (§29:783, D-S-18).
 *
 * Import-only from `@intafaced/quant-studio-risk`. Does not scaffold svc-quant
 * or a studio SPA. Does not edit ops-analytics.
 */
export {
  FUTURE_RETURN_FORBIDDEN,
  REQUIRED_RISK_BLOCKS,
  RISK_BLOCK_UNSET,
  assembleStrategy,
  assertRiskBlocks,
  type AssembleStrategyResult,
  type AssertRiskBlocksResult,
  type DrawdownHaltBlock,
  type FutureReturnRefusal,
  type PositionCapBlock,
  type RequiredRiskBlock,
  type RiskBlockRefusal,
  type RiskBlocks,
  type StopPolicyBlock,
  type StrategyAssembleInput,
} from '@intafaced/quant-studio-risk';
