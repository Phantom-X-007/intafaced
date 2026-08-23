import { describe, expect, it } from 'vitest';
import { MemoryLedger } from '@intafaced/ledger-client';
import { submitShare } from './submit-share.js';

describe('mining submitShare', () => {
  it("mutate('mining','submitShare') posts PPLNS rewards through the ledger", async () => {
    const ledger = new MemoryLedger();
    const alice = '11111111-1111-4111-8111-111111111111';
    const bob = '22222222-2222-4222-8222-222222222222';
    const plan = await submitShare(ledger, {
      windowId: 'epoch-1',
      epoch: 1,
      assetId: 'IFC',
      reward: '10',
      feeBps: 100,
      shares: [
        { shareId: 'a', minerId: alice, weight: 1n },
        { shareId: 'b', minerId: bob, weight: 3n },
      ],
    });
    expect(plan.payouts).toEqual([
      { minerId: alice, amount: '2.475' },
      { minerId: bob, amount: '7.425' },
    ]);
    expect((await ledger.getTxByKey(`reward:mining:pplns:epoch-1:${alice}`))?.reason).toBe('mining.pplns.payout');
    expect((await ledger.getTxByKey(`reward:mining:pplns:epoch-1:${bob}`))?.reason).toBe('mining.pplns.payout');
    expect((await ledger.getTxByKey('token.emission:IFC:1'))?.reason).toBe('token.emission');
  });
});
