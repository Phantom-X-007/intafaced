/**
 * @intafaced/quant-studio-risk — §29 mandatory risk-block contract.
 *
 * No studio UI, no svc-quant, no lake, no return figure.
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
} from './risk-blocks.js';
