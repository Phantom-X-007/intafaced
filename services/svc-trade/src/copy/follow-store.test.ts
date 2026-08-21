import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { CopyError } from './errors.js';
import { MemoryCopyFollowStore, rethrowCopyFollowUnique } from './follow-store.js';
import type { CopyFollow } from './follows.js';

const FOLLOWER = '00000000-0000-4000-8000-000000000001';
const LEADER = '00000000-0000-4000-8000-000000000002';

function follow(followId: string, leaderId = LEADER): CopyFollow {
  return {
    followId,
    followerId: FOLLOWER,
    leaderId,
    envelope: {
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: parseAmount('100'),
      maxAggregateExposure: parseAmount('1000'),
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    },
    region: 'SG',
    createdAt: new Date('2026-08-14T00:00:00.000Z'),
    feeShareKilled: false,
  };
}

describe('CopyFollowStore unique (follower, leader)', () => {
  it('memory refuses a second followId for the same pair (SQL unique equivalent)', async () => {
    const store = new MemoryCopyFollowStore();
    await store.saveFollow(follow('aaaa1111-1111-4111-8111-111111111111'));
    await expect(store.saveFollow(follow('bbbb2222-2222-4222-8222-222222222222'))).rejects.toMatchObject({
      name: 'CopyError',
      code: 'trade.copy_already_following',
    });
  });

  it('memory still upserts the same followId (kill / envelope refresh)', async () => {
    const store = new MemoryCopyFollowStore();
    const row = follow('aaaa1111-1111-4111-8111-111111111111');
    await store.saveFollow(row);
    await store.saveFollow({ ...row, feeShareKilled: true });
    expect((await store.getFollow(row.followId))?.feeShareKilled).toBe(true);
  });

  it('rethrowCopyFollowUnique maps 23505 and passes other failures through', () => {
    expect(() => rethrowCopyFollowUnique(Object.assign(new Error('dup'), { code: '23505' }))).toThrow(CopyError);
    expect(() => rethrowCopyFollowUnique(Object.assign(new Error('fk'), { code: '23503' }))).toThrow(/fk/);
    try {
      rethrowCopyFollowUnique(Object.assign(new Error('dup'), { code: '23505' }));
    } catch (err) {
      expect(err).toMatchObject({ code: 'trade.copy_already_following' });
      expect((err as { code: string }).code).not.toBe('23505');
    }
  });
});
