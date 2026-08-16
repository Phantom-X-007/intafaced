/**
 * §29 Strategy Studio — mandatory risk blocks (D-S-18 + law :783).
 *
 * A strategy that can be assembled without position caps, stop policy, and
 * drawdown halt is a bug. This package is the contract/refusal door only:
 * no studio SPA, no svc-quant, no market data, no backtest numbers, no
 * invented default caps.
 */

export const REQUIRED_RISK_BLOCKS = ['positionCap', 'stopPolicy', 'drawdownHalt'] as const;
export type RequiredRiskBlock = (typeof REQUIRED_RISK_BLOCKS)[number];

export const RISK_BLOCK_UNSET = 'quant.risk_block_unset' as const;
export const FUTURE_RETURN_FORBIDDEN = 'quant.future_return_forbidden' as const;

/** Owner-supplied decimal/bps strings. Magnitudes are never invented here. */
export interface PositionCapBlock {
  readonly notional: string;
}

export interface StopPolicyBlock {
  readonly distanceBps: string;
}

export interface DrawdownHaltBlock {
  readonly maxDrawdownBps: string;
}

export interface RiskBlocks {
  readonly positionCap: PositionCapBlock;
  readonly stopPolicy: StopPolicyBlock;
  readonly drawdownHalt: DrawdownHaltBlock;
}

export interface StrategyAssembleInput {
  readonly strategyId?: string;
  readonly positionCap?: PositionCapBlock | null;
  readonly stopPolicy?: StopPolicyBlock | null;
  readonly drawdownHalt?: DrawdownHaltBlock | null;
  readonly expectedReturn?: unknown;
  readonly expected_return?: unknown;
  readonly futureReturn?: unknown;
  readonly projectedReturn?: unknown;
}

export type RiskBlockRefusal = {
  readonly code: typeof RISK_BLOCK_UNSET;
  readonly block: RequiredRiskBlock;
  readonly detail: string;
};

export type FutureReturnRefusal = {
  readonly code: typeof FUTURE_RETURN_FORBIDDEN;
  readonly detail: string;
};

export type AssertRiskBlocksResult =
  { readonly ok: true; readonly riskBlocks: RiskBlocks } | { readonly ok: false; readonly refusal: RiskBlockRefusal };

export type AssembleStrategyResult =
  | {
      readonly ok: true;
      readonly envelope: {
        readonly strategyId: string | null;
        readonly riskBlocks: RiskBlocks;
        readonly dataLake: 'absent';
      };
    }
  | { readonly ok: false; readonly refusal: RiskBlockRefusal | FutureReturnRefusal };

const DECIMAL_OR_BPS = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

const FUTURE_RETURN_KEYS = ['expectedReturn', 'expected_return', 'futureReturn', 'projectedReturn'] as const;

function isOwnerDecimalOrBps(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_OR_BPS.test(value.trim()) && value.trim() === value;
}

function missingBlock(block: RequiredRiskBlock): AssertRiskBlocksResult {
  return {
    ok: false,
    refusal: {
      code: RISK_BLOCK_UNSET,
      block,
      detail: `${block} is mandatory and owner-supplied; no default cap is invented`,
    },
  };
}

/**
 * Fail-closed gate: all three §29 risk blocks must be present as owner-supplied
 * decimal/bps strings. Absence is `quant.risk_block_unset`, never a default.
 */
export function assertRiskBlocks(input: StrategyAssembleInput | null | undefined): AssertRiskBlocksResult {
  if (!input) return missingBlock('positionCap');

  const positionCap = input.positionCap;
  if (!positionCap || !isOwnerDecimalOrBps(positionCap.notional)) {
    return missingBlock('positionCap');
  }

  const stopPolicy = input.stopPolicy;
  if (!stopPolicy || !isOwnerDecimalOrBps(stopPolicy.distanceBps)) {
    return missingBlock('stopPolicy');
  }

  const drawdownHalt = input.drawdownHalt;
  if (!drawdownHalt || !isOwnerDecimalOrBps(drawdownHalt.maxDrawdownBps)) {
    return missingBlock('drawdownHalt');
  }

  return {
    ok: true,
    riskBlocks: {
      positionCap: { notional: positionCap.notional },
      stopPolicy: { distanceBps: stopPolicy.distanceBps },
      drawdownHalt: { maxDrawdownBps: drawdownHalt.maxDrawdownBps },
    },
  };
}

function futureReturnKeyPresent(input: StrategyAssembleInput): boolean {
  const record = input as Record<string, unknown>;
  return FUTURE_RETURN_KEYS.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/**
 * Pure assembler. Refuses unless `assertRiskBlocks` passes. Never reads a
 * book, never emits expected return, and always names the data lake absent.
 */
export function assembleStrategy(input: StrategyAssembleInput | null | undefined): AssembleStrategyResult {
  if (input && futureReturnKeyPresent(input)) {
    return {
      ok: false,
      refusal: {
        code: FUTURE_RETURN_FORBIDDEN,
        detail: 'a strategy envelope must not carry a future-return or expected-return key',
      },
    };
  }

  const asserted = assertRiskBlocks(input);
  if (!asserted.ok) return asserted;

  const strategyId = input?.strategyId?.trim() ? input.strategyId.trim() : null;

  return {
    ok: true,
    envelope: {
      strategyId,
      riskBlocks: asserted.riskBlocks,
      dataLake: 'absent',
    },
  };
}
