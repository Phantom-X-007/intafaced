import { describe, expect, it } from 'vitest';
import {
  FUTURE_RETURN_FORBIDDEN,
  REQUIRED_RISK_BLOCKS,
  RISK_BLOCK_UNSET,
  assembleStrategy,
  assertRiskBlocks,
  type StrategyAssembleInput,
} from './risk-blocks.js';

function completeBlocks(overrides: Partial<StrategyAssembleInput> = {}): StrategyAssembleInput {
  return {
    strategyId: 'studio-mean-reversion',
    positionCap: { notional: '25000.00' },
    stopPolicy: { distanceBps: '75' },
    drawdownHalt: { maxDrawdownBps: '400' },
    ...overrides,
  };
}

describe('assertRiskBlocks', () => {
  it.each(['positionCap', 'stopPolicy', 'drawdownHalt'] as const)('refuses when %s is missing', (block) => {
    const input = completeBlocks({ [block]: undefined });
    const result = assertRiskBlocks(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe(RISK_BLOCK_UNSET);
      expect(result.refusal.block).toBe(block);
    }
  });

  it('accepts structure only when all three owner-supplied strings are present', () => {
    const result = assertRiskBlocks(completeBlocks());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(REQUIRED_RISK_BLOCKS.every((block) => block in result.riskBlocks)).toBe(true);
    expect(result.riskBlocks).toEqual({
      positionCap: { notional: '25000.00' },
      stopPolicy: { distanceBps: '75' },
      drawdownHalt: { maxDrawdownBps: '400' },
    });
  });

  it('does not invent a default when a string field is blank', () => {
    const result = assertRiskBlocks(completeBlocks({ positionCap: { notional: '' } }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe(RISK_BLOCK_UNSET);
  });
});

describe('assembleStrategy', () => {
  it('refuses assembly when any risk block is unset', () => {
    const result = assembleStrategy(completeBlocks({ drawdownHalt: null }));

    expect(result).toEqual({
      ok: false,
      refusal: {
        code: RISK_BLOCK_UNSET,
        block: 'drawdownHalt',
        detail: 'drawdownHalt is mandatory and owner-supplied; no default cap is invented',
      },
    });
  });

  it('accepts structure only — no market data, no expected return, lake named absent', () => {
    const result = assembleStrategy(completeBlocks());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.dataLake).toBe('absent');
    expect(result.envelope).not.toHaveProperty('expectedReturn');
    expect(result.envelope).not.toHaveProperty('venues');
    expect(Object.keys(result.envelope).sort()).toEqual(['dataLake', 'riskBlocks', 'strategyId']);
    expect(result.envelope.riskBlocks.positionCap.notional).toBe('25000.00');
  });

  it.each(['expectedReturn', 'expected_return', 'futureReturn', 'projectedReturn'] as const)('rejects future-return key %s', (key) => {
    const result = assembleStrategy(completeBlocks({ [key]: '0.12' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe(FUTURE_RETURN_FORBIDDEN);
    }
  });
});
