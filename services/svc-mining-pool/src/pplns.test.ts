import { describe, expect, it } from 'vitest';
import { planPplns } from './pplns.js';
describe('PPLNS', () => {
  it('is deterministic, proportional, and does not invent a reward', () => {
    expect(
      planPplns({
        windowId: 'w',
        assetId: 'IFC',
        reward: '10',
        feeBps: 100,
        shares: [
          { shareId: 'a', minerId: 'alice', weight: 1n },
          { shareId: 'b', minerId: 'bob', weight: 3n },
        ],
      }),
    ).toEqual({
      windowId: 'w',
      assetId: 'IFC',
      gross: '10',
      fee: '0.1',
      net: '9.9',
      retained: '0',
      payouts: [
        { minerId: 'alice', amount: '2.475' },
        { minerId: 'bob', amount: '7.425' },
      ],
    });
    expect(() => planPplns({ windowId: 'w', assetId: 'IFC', reward: '', feeBps: 100, shares: [] })).toThrow('reward_unconfigured');
  });
});
