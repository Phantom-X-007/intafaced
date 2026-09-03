import { describe, expect, it } from 'vitest';
import { deltaHedgeOwnerEnvComposeWired, quantLibNativeComposeWired, tradeComposeBlock } from './greeks-compose-wiring.js';

describe('trade.greeks fleet compose wiring', () => {
  it('passes INTAFACED_QUANTLIB_NATIVE with empty default — never invents a .node path', () => {
    expect(quantLibNativeComposeWired()).toBe(true);
    const block = tradeComposeBlock();
    expect(block).not.toMatch(/INTAFACED_QUANTLIB_NATIVE:\s*\/|INTAFACED_QUANTLIB_NATIVE:\s*'[^$]/);
  });

  it('passes delta-hedge target/range/instrument empty — never invents 0 or MMP', () => {
    expect(deltaHedgeOwnerEnvComposeWired()).toBe(true);
    const block = tradeComposeBlock();
    expect(block).not.toMatch(/TRADE_DELTA_HEDGE_TARGET:\s*['"]?[0-9]/);
    expect(block).not.toMatch(/TRADE_DELTA_HEDGE_RANGE:\s*['"]?[0-9]/);
    expect(block).not.toMatch(/EXECUTION_MM_MMP_THRESHOLDS/);
  });
});
