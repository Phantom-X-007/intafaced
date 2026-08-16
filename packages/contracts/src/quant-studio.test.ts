import { describe, expect, it } from 'vitest';
import {
  FUTURE_RETURN_FORBIDDEN,
  REQUIRED_RISK_BLOCKS,
  RISK_BLOCK_UNSET,
  assembleStrategy,
  assertRiskBlocks,
  type StrategyAssembleInput,
} from './quant-studio.js';

function completeBlocks(overrides: Partial<StrategyAssembleInput> = {}): StrategyAssembleInput {
  return {
    strategyId: 'studio-structure-only',
    positionCap: { notional: '1000' },
    stopPolicy: { distanceBps: '50' },
    drawdownHalt: { maxDrawdownBps: '200' },
    ...overrides,
  };
}

describe('quant studio contracts re-export — §29 risk blocks', () => {
  it.each(REQUIRED_RISK_BLOCKS)('refuses missing %s', (block) => {
    const result = assembleStrategy(completeBlocks({ [block]: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok && result.refusal.code === RISK_BLOCK_UNSET) {
      expect(result.refusal.block).toBe(block);
    }
  });

  it('accepts structure only when all three blocks are owner-supplied', () => {
    const asserted = assertRiskBlocks(completeBlocks());
    const assembled = assembleStrategy(completeBlocks());

    expect(asserted.ok).toBe(true);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.envelope.dataLake).toBe('absent');
    expect(assembled.envelope.riskBlocks).toEqual({
      positionCap: { notional: '1000' },
      stopPolicy: { distanceBps: '50' },
      drawdownHalt: { maxDrawdownBps: '200' },
    });
  });

  it('rejects a future-return key', () => {
    const result = assembleStrategy(completeBlocks({ expectedReturn: '12' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.code).toBe(FUTURE_RETURN_FORBIDDEN);
  });
});
