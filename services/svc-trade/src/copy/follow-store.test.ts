import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { CopyError } from './errors.js';
import { MemoryCopyFollowStore, rethrowCopyFollowUnique } from './follow-store.js';
import type { CopyFollow } from './follows.js';

const FOLLOWER = '00000000-0000-4000-8000-000000000001';
const LEADER = '00000000-0000-4000-8000-000000000002';

function follow(followId: string, leaderId = LEADER, region = 'SG', markets: readonly string[] = ['BTC-USDT']): CopyFollow {
  return {
    followId,
    followerId: FOLLOWER,
    leaderId,
    envelope: {
      permittedMarkets: [...markets],
      maxNotionalPerOrder: parseAmount('100'),
      maxAggregateExposure: parseAmount('1000'),
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    },
    region,
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

describe('listFollowsByFollower', () => {
  it('scopes by followerId first; optional leaderId exact-matches', async () => {
    const store = new MemoryCopyFollowStore();
    const other = '00000000-0000-4000-8000-000000000099';
    const leaderB = '00000000-0000-4000-8000-000000000003';
    await store.saveFollow(follow('aaaa1111-1111-4111-8111-111111111111'));
    await store.saveFollow(follow('bbbb2222-2222-4222-8222-222222222222', leaderB));
    await store.saveFollow({ ...follow('cccc3333-3333-4333-8333-333333333333'), followerId: other });

    const mine = await store.listFollowsByFollower(FOLLOWER);
    expect(mine).toHaveLength(2);

    const one = await store.listFollowsByFollower(FOLLOWER, LEADER);
    expect(one).toHaveLength(1);
    expect(one[0]?.leaderId).toBe(LEADER);
    expect(one[0]?.followerId).toBe(FOLLOWER);

    expect(await store.listFollowsByFollower(FOLLOWER, 'no-such-leader')).toEqual([]);

    const stranger = await store.listFollowsByFollower(other, LEADER);
    expect(stranger).toHaveLength(1);
    expect(stranger[0]?.followerId).toBe(other);
    expect(stranger[0]?.leaderId).toBe(LEADER);
  });

  it('scopes by followerId first; optional region exact-matches and composes with leaderId', async () => {
    const store = new MemoryCopyFollowStore();
    const other = '00000000-0000-4000-8000-000000000099';
    const leaderB = '00000000-0000-4000-8000-000000000003';
    await store.saveFollow(follow('aaaa1111-1111-4111-8111-111111111111', LEADER, 'SG'));
    await store.saveFollow(follow('bbbb2222-2222-4222-8222-222222222222', leaderB, 'AE'));
    await store.saveFollow({ ...follow('cccc3333-3333-4333-8333-333333333333', LEADER, 'SG'), followerId: other });

    const omitted = await store.listFollowsByFollower(FOLLOWER);
    expect(omitted).toHaveLength(2);

    const sg = await store.listFollowsByFollower(FOLLOWER, undefined, 'SG');
    expect(sg).toHaveLength(1);
    expect(sg[0]?.region).toBe('SG');
    expect(sg[0]?.leaderId).toBe(LEADER);
    expect(sg[0]?.followerId).toBe(FOLLOWER);

    expect(await store.listFollowsByFollower(FOLLOWER, undefined, 'JP')).toEqual([]);

    const both = await store.listFollowsByFollower(FOLLOWER, LEADER, 'SG');
    expect(both).toHaveLength(1);
    expect(both[0]?.leaderId).toBe(LEADER);
    expect(both[0]?.region).toBe('SG');
    expect(await store.listFollowsByFollower(FOLLOWER, LEADER, 'AE')).toEqual([]);

    const stranger = await store.listFollowsByFollower(other, undefined, 'SG');
    expect(stranger).toHaveLength(1);
    expect(stranger[0]?.followerId).toBe(other);
  });

  it('scopes by followerId first; optional feeShareKilled exact-matches and composes with leaderId and region', async () => {
    const store = new MemoryCopyFollowStore();
    const other = '00000000-0000-4000-8000-000000000099';
    const leaderB = '00000000-0000-4000-8000-000000000003';
    await store.saveFollow(follow('aaaa1111-1111-4111-8111-111111111111', LEADER, 'SG'));
    await store.saveFollow({
      ...follow('bbbb2222-2222-4222-8222-222222222222', leaderB, 'AE'),
      feeShareKilled: true,
    });
    await store.saveFollow({
      ...follow('cccc3333-3333-4333-8333-333333333333', LEADER, 'SG'),
      followerId: other,
      feeShareKilled: true,
    });

    const omitted = await store.listFollowsByFollower(FOLLOWER);
    expect(omitted).toHaveLength(2);
    expect(omitted.some((f) => f.feeShareKilled)).toBe(true);
    expect(omitted.some((f) => !f.feeShareKilled)).toBe(true);

    const live = await store.listFollowsByFollower(FOLLOWER, undefined, undefined, false);
    expect(live).toHaveLength(1);
    expect(live[0]?.feeShareKilled).toBe(false);
    expect(live[0]?.leaderId).toBe(LEADER);
    expect(live[0]?.followerId).toBe(FOLLOWER);

    const killed = await store.listFollowsByFollower(FOLLOWER, undefined, undefined, true);
    expect(killed).toHaveLength(1);
    expect(killed[0]?.feeShareKilled).toBe(true);
    expect(killed[0]?.leaderId).toBe(leaderB);

    expect(await store.listFollowsByFollower(FOLLOWER, LEADER, 'SG', true)).toEqual([]);
    const composed = await store.listFollowsByFollower(FOLLOWER, LEADER, 'SG', false);
    expect(composed).toHaveLength(1);
    expect(composed[0]?.leaderId).toBe(LEADER);

    const stranger = await store.listFollowsByFollower(other, undefined, undefined, true);
    expect(stranger).toHaveLength(1);
    expect(stranger[0]?.followerId).toBe(other);
    expect(await store.listFollowsByFollower(FOLLOWER, 'no-such-leader', undefined, true)).toEqual([]);
  });

  it('scopes by followerId first; optional marketId is permitted_markets containment and composes with feeShareKilled', async () => {
    const store = new MemoryCopyFollowStore();
    const other = '00000000-0000-4000-8000-000000000099';
    const leaderB = '00000000-0000-4000-8000-000000000003';
    await store.saveFollow(follow('aaaa1111-1111-4111-8111-111111111111', LEADER, 'SG', ['BTC-USDT']));
    await store.saveFollow({
      ...follow('bbbb2222-2222-4222-8222-222222222222', leaderB, 'AE', ['ETH-USDT', 'SOL-USDT']),
      feeShareKilled: true,
    });
    await store.saveFollow({
      ...follow('cccc3333-3333-4333-8333-333333333333', LEADER, 'SG', ['BTC-USDT']),
      followerId: other,
    });

    const omitted = await store.listFollowsByFollower(FOLLOWER);
    expect(omitted).toHaveLength(2);
    expect(omitted.map((f) => f.envelope.permittedMarkets[0]).sort()).toEqual(['BTC-USDT', 'ETH-USDT']);

    const btc = await store.listFollowsByFollower(FOLLOWER, undefined, undefined, undefined, 'BTC-USDT');
    expect(btc).toHaveLength(1);
    expect(btc[0]?.envelope.permittedMarkets).toContain('BTC-USDT');
    expect(btc[0]?.leaderId).toBe(LEADER);
    expect(btc[0]?.followerId).toBe(FOLLOWER);

    const eth = await store.listFollowsByFollower(FOLLOWER, undefined, undefined, undefined, 'ETH-USDT');
    expect(eth).toHaveLength(1);
    expect(eth[0]?.envelope.permittedMarkets).toContain('ETH-USDT');
    expect(eth[0]?.leaderId).toBe(leaderB);

    expect(await store.listFollowsByFollower(FOLLOWER, undefined, undefined, undefined, 'DOGE-USDT')).toEqual([]);

    expect(await store.listFollowsByFollower(FOLLOWER, undefined, undefined, true, 'BTC-USDT')).toEqual([]);
    const composed = await store.listFollowsByFollower(FOLLOWER, undefined, undefined, true, 'ETH-USDT');
    expect(composed).toHaveLength(1);
    expect(composed[0]?.leaderId).toBe(leaderB);
    expect(composed[0]?.feeShareKilled).toBe(true);

    const stranger = await store.listFollowsByFollower(other, undefined, undefined, undefined, 'BTC-USDT');
    expect(stranger).toHaveLength(1);
    expect(stranger[0]?.followerId).toBe(other);
  });
});
