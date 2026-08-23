import { describe, expect, it } from 'vitest';
import { QUANT_STUDIO_RISK_BLOCK_REQUIRED } from '../errors.js';
import { compileStudioSource, saveStudio } from './save.js';
import { createStudioStore } from './store.js';

const block = { side: 'buy' as const, symbol: 'BTC-USD', qty: '0.01' };
const risk = { maxDrawdown: '500', maxNotional: '10000', kill: '100' };

describe('studio.save — mandatory risk block', () => {
  it('refuses by name when the risk block is missing', () => {
    const store = createStudioStore();
    expect(() => saveStudio({ name: 'alpha', blocks: [block], cash: '10000' }, store)).toThrow(QUANT_STUDIO_RISK_BLOCK_REQUIRED);
    expect(store.list()).toHaveLength(0);
  });

  it('refuses by name when maxDrawdown / maxNotional / kill is blank', () => {
    const store = createStudioStore();
    expect(() =>
      saveStudio({ name: 'alpha', blocks: [block], cash: '10000', risk: { maxDrawdown: '500', maxNotional: '10000', kill: '' } }, store),
    ).toThrow(QUANT_STUDIO_RISK_BLOCK_REQUIRED);
    expect(() =>
      saveStudio({ name: 'alpha', blocks: [block], cash: '10000', risk: { maxDrawdown: '', maxNotional: '10000', kill: '100' } }, store),
    ).toThrow(QUANT_STUDIO_RISK_BLOCK_REQUIRED);
    expect(() =>
      saveStudio({ name: 'alpha', blocks: [block], cash: '10000', risk: { maxDrawdown: '500', maxNotional: '  ', kill: '100' } }, store),
    ).toThrow(QUANT_STUDIO_RISK_BLOCK_REQUIRED);
  });

  it('persists decimal-string risk and compiles blocks for sandbox.run — no invented return', () => {
    const store = createStudioStore();
    const saved = saveStudio({ name: 'alpha', blocks: [block], cash: '10000', risk }, store);
    expect('ok' in saved).toBe(false);
    expect(saved.risk).toEqual(risk);
    expect(typeof saved.risk.maxDrawdown).toBe('string');
    expect(typeof saved.risk.maxNotional).toBe('string');
    expect(typeof saved.risk.kill).toBe('string');
    expect(saved.language).toBe('javascript');
    expect(saved.source).toBe('oms.buy("BTC-USD", "0.01");');
    expect(saved.cash).toBe('10000');
    expect('pnl' in saved).toBe(false);
    expect('return' in saved).toBe(false);
    expect(store.get(saved.id)?.name).toBe('alpha');
  });

  it('compiles a visual block list into isolate source', () => {
    expect(
      compileStudioSource([
        { side: 'buy', symbol: 'BTC-USD', qty: '0.01' },
        { side: 'sell', symbol: 'ETH-USD', qty: '0.5' },
      ]),
    ).toBe('oms.buy("BTC-USD", "0.01");\noms.sell("ETH-USD", "0.5");');
  });
});
