import { describe, expect, it } from 'vitest';
import { parsePplnsBody } from './submit-share.js';

describe('mining submitShare parse', () => {
  it('refuses JS number amounts and weights at the HTTP boundary', () => {
    expect(() =>
      parsePplnsBody({
        windowId: 'w',
        epoch: 1,
        assetId: 'IFC',
        reward: 10,
        feeBps: 100,
        shares: [{ shareId: 'a', minerId: 'alice', weight: '1' }],
      }),
    ).toThrow('mining.amount_not_decimal');
    expect(() =>
      parsePplnsBody({
        windowId: 'w',
        epoch: 1,
        assetId: 'IFC',
        reward: '10',
        feeBps: 100,
        shares: [{ shareId: 'a', minerId: 'alice', weight: 1 }],
      }),
    ).toThrow('mining.weight_not_integer');
  });

  it('accepts decimal-string reward and integer-string weight', () => {
    expect(
      parsePplnsBody({
        windowId: 'w',
        epoch: 1,
        assetId: 'IFC',
        reward: '10',
        feeBps: 100,
        shares: [{ shareId: 'a', minerId: 'alice', weight: '1' }],
      }),
    ).toEqual({
      windowId: 'w',
      epoch: 1,
      assetId: 'IFC',
      reward: '10',
      feeBps: 100,
      shares: [{ shareId: 'a', minerId: 'alice', weight: 1n }],
    });
  });
});
