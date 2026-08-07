import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount, recipes, formatAmount, userAvailable } from '@intafaced/ledger-client';
import { CopyService } from './copy-service.js';
import { MemoryCopyFollowStore } from './follow-store.js';
import { UNPUBLISHED_COPY_FEE_SHARE_LAW, type CopyFeeShareLaw, type CopyJurisdictionLaw } from './fee-share-law.js';
import { CopyError } from './errors.js';

const FOLLOWER = '00000000-0000-4000-8000-000000000001';
const LEADER = '00000000-0000-4000-8000-000000000002';
const principal = { userId: FOLLOWER } as import('@intafaced/auth').Principal;

const publishedFee: CopyFeeShareLaw = {
  published: true,
  leaderShareBps: 5_000,
  earningsCapPerFollower: '100',
  decayRoundTrips: 100,
  decayShareBps: 1_000,
};

const publishedJur: CopyJurisdictionLaw = {
  published: true,
  allowedRegions: ['SG'],
};

const futureExpiry = '2026-12-01T00:00:00.000Z';

describe('CopyService', () => {
  it('deskStatus refuse-closed when §8 blanks', () => {
    const svc = new CopyService(new MemoryLedger());
    const s = svc.deskStatus();
    expect(s.feeSharePublished).toBe(false);
    expect(s.jurisdictionPublished).toBe(false);
    expect(s.residual).toContain('DIRECTION §8');
  });

  it('follow refuses when jurisdiction law blank — never invents allowlist', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: { published: false },
    });
    await expect(
      svc.follow(principal, {
        leaderId: LEADER,
        region: 'SG',
        permittedMarkets: ['BTC-USDT'],
        maxNotionalPerOrder: '100',
        maxAggregateExposure: '1000',
        expiresAt: futureExpiry,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_jurisdiction_blank' });
  });

  it('follow refuses region not on owner allowlist', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
    });
    await expect(
      svc.follow(principal, {
        leaderId: LEADER,
        region: 'US',
        permittedMarkets: ['BTC-USDT'],
        maxNotionalPerOrder: '100',
        maxAggregateExposure: '1000',
        expiresAt: futureExpiry,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_jurisdiction_blocked' });
  });

  it('follow → mirror plan within envelope; cap exceed refuses', async () => {
    let now = new Date('2026-08-07T12:00:00.000Z');
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      now: () => now,
    });

    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'sg',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '150',
      expiresAt: futureExpiry,
    });
    expect(follow.region).toBe('SG');
    expect(follow.maxNotionalPerOrder).toBe('100');

    const plan = await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '80',
    });
    expect(plan.notional).toBe('80');
    expect(plan.reason).toBe('within_envelope');

    await expect(
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '80',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_cap_exceeded' });

    await expect(
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        marketId: 'ETH-USDT',
        side: 'buy',
        qty: '1',
        notional: '10',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_market_not_permitted' });

    now = new Date('2027-01-01T00:00:00.000Z');
    await expect(
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.001',
        notional: '10',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_key_expired' });
  });

  it('unfollow always works (unilateral revoke)', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: UNPUBLISHED_COPY_FEE_SHARE_LAW,
      jurisdictionLaw: publishedJur,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    const revoked = await svc.unfollow(principal, { followId: follow.followId });
    expect(revoked.revoked).toBe(true);
  });

  it('settleFeeShare refuses blank fee law; settles via ledger when published', async () => {
    const blank = new CopyService(new MemoryLedger(), {
      feeShareLaw: UNPUBLISHED_COPY_FEE_SHARE_LAW,
      jurisdictionLaw: publishedJur,
    });
    const f0 = await blank.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '1000',
      maxAggregateExposure: '10000',
      expiresAt: futureExpiry,
    });
    await expect(
      blank.settleFeeShare(principal, {
        followId: f0.followId,
        fillId: 'fill-x',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_fee_share_blank' });

    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('100'),
        rail: 'test',
        railRef: 'copy-svc',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'svc-seed',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('10'),
      }),
    );

    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '1000',
      maxAggregateExposure: '10000',
      expiresAt: futureExpiry,
    });
    const settled = await svc.settleFeeShare(principal, {
      followId: follow.followId,
      fillId: 'fill-ok',
      assetId: 'USDT',
      followerFillNotional: '1000',
      protocolFeeBps: 10,
    });
    expect(settled.settled).toBe(true);
    expect(settled.cappedLeaderShare).toBe('0.5');
    expect(formatAmount((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount)).toBe('0.5');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('forbids ranking and P&L fees explicitly', () => {
    const svc = new CopyService(new MemoryLedger());
    try {
      svc.rankLeadersByReturns();
      expect.unreachable('rank');
    } catch (err) {
      expect((err as CopyError).code).toBe('trade.copy_ranking_forbidden');
    }
    try {
      svc.chargePnlPerformanceFee();
      expect.unreachable('pnl');
    } catch (err) {
      expect((err as CopyError).code).toBe('trade.copy_pnl_fee_forbidden');
    }
  });

  it('follow + exposure survive a process restart (shared durable store)', async () => {
    // Two CopyService instances share one store — models restart with SqlCopyFollowStore.
    const store = new MemoryCopyFollowStore();
    const first = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const follow = await first.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await first.planMirrorForFollow(principal, {
      followId: follow.followId,
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '40',
    });

    // "Restart": new service, same store — no in-process Maps left.
    const second = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const reloaded = await store.getFollow(follow.followId);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.leaderId).toBe(LEADER);
    expect(formatAmount(await store.getExposure(follow.followId))).toBe('40');

    // Cap still enforced against durable exposure.
    await expect(
      second.planMirrorForFollow(principal, {
        followId: follow.followId,
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '970',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_cap_exceeded' });
  });
});
