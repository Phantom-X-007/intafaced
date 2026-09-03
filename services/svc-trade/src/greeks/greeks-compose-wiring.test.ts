import { describe, expect, it } from 'vitest';
import { quantLibNativeComposeWired, tradeComposeBlock } from './greeks-compose-wiring.js';

describe('trade.greeks fleet compose wiring', () => {
  it('passes INTAFACED_QUANTLIB_NATIVE with empty default — never invents a .node path', () => {
    expect(quantLibNativeComposeWired()).toBe(true);
    const block = tradeComposeBlock();
    expect(block).not.toMatch(/INTAFACED_QUANTLIB_NATIVE:\s*\/|INTAFACED_QUANTLIB_NATIVE:\s*'[^$]/);
  });
});
