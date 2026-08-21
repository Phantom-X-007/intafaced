import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount, recipes, formatAmount, userAvailable } from '@intafaced/ledger-client';
import { CopyService, type LookupFollowerFillFeePort } from './copy-service.js';
import { MemoryCopyFollowStore } from './follow-store.js';
import { UNPUBLISHED_COPY_FEE_SHARE_LAW, type CopyFeeShareLaw, type CopyJurisdictionLaw } from './fee-share-law.js';
import { CopyError } from './errors.js';

const FOLLOWER = '00000000-0000-4000-8000-000000000001';
const LEADER = '00000000-0000-4000-8000-000000000002';
const LEADER_B = '00000000-0000-4000-8000-000000000003';
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

function lookupFillFee(feeAmount: string): LookupFollowerFillFeePort {
  return async (fillId) => ({
    fillId,
    userId: FOLLOWER,
    feeAsset: 'USDT',
    feeAmount: parseAmount(feeAmount),
    createdAt: new Date(Date.now() + 60_000),
  });
}

describe('CopyService', () => {
  it('deskStatus refuse-closed when §8 blanks', () => {
    const svc = new CopyService(new MemoryLedger());
    const s = svc.deskStatus();
    expect(s.feeSharePublished).toBe(false);
    expect(s.jurisdictionPublished).toBe(false);
    expect(s.residual).toContain('DIRECTION §8');
    expect(s.residual).toContain('D26-P0-02');
    expect(s.residual).toContain('D26-P0-15');
    expect(s.residuals.rates).toContain('D26-P0-02');
    expect(s.residuals.jurisdiction).toContain('D26-P0-15');
    expect(s.sovereign).toEqual({
      shape: 'sovereign',
      custody: false,
      feeModel: 'protocol_fee_share',
      pnlFeeForbidden: true,
      rankingForbidden: true,
      killUnfollowReal: true,
    });
  });

  it('published empty allowlist serves none — still refuse-closed (D26-P0-15)', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: { published: true, allowedRegions: [] },
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
    ).rejects.toMatchObject({ code: 'trade.copy_jurisdiction_blocked' });
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

  it('published empty allowlist serves none — still refuse-closed (D26-P0-15)', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: { published: true, allowedRegions: [] },
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
    ).rejects.toMatchObject({ code: 'trade.copy_jurisdiction_blocked' });
  });

  it('listMyFollows and already-following never scan every follow in the store', async () => {
    const OTHER = '00000000-0000-4000-8000-000000000099';
    class SpyStore extends MemoryCopyFollowStore {
      listFollowsCalls = 0;
      override async listFollows() {
        this.listFollowsCalls += 1;
        return super.listFollows();
      }
    }
    const store = new SpyStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    await svc.follow({ userId: OTHER } as import('@intafaced/auth').Principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['ETH-USDT'],
      maxNotionalPerOrder: '50',
      maxAggregateExposure: '500',
      expiresAt: futureExpiry,
    });
    store.listFollowsCalls = 0;
    expect(await svc.listMyFollows(principal)).toEqual([]);
    const mine = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    const listed = await svc.listMyFollows(principal);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.followId).toBe(mine.followId);
    expect(listed[0]?.leaderId).toBe(LEADER);
    expect(listed[0]?.currentExposure).toBe('0');
    expect(listed[0]?.remainingExposure).toBe('1000');
    expect(store.listFollowsCalls).toBe(0);
    await expect(
      svc.follow(principal, {
        leaderId: LEADER,
        region: 'SG',
        permittedMarkets: ['BTC-USDT'],
        maxNotionalPerOrder: '100',
        maxAggregateExposure: '1000',
        expiresAt: futureExpiry,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_already_following' });
    expect(store.listFollowsCalls).toBe(0);
  });

  it('listMyFollows surfaces durable session budget usage after mirrors', async () => {
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '500',
      expiresAt: futureExpiry,
    });
    expect(follow.currentExposure).toBe('0');
    expect(follow.remainingExposure).toBe('500');

    await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-desk-exposure',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '80',
    });

    const listed = await svc.listMyFollows(principal);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.currentExposure).toBe('80');
    expect(listed[0]?.remainingExposure).toBe('420');
  });

  it('concurrent follow race maps unique (follower,leader) to already_following, not a raw 23505', async () => {
    class RaceStore extends MemoryCopyFollowStore {
      override async listFollowsByFollower() {
        return [];
      }
    }
    const store = new RaceStore();
    const opts = { feeShareLaw: publishedFee, jurisdictionLaw: publishedJur, store };
    const first = new CopyService(new MemoryLedger(), opts);
    const second = new CopyService(new MemoryLedger(), opts);
    await first.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await expect(
      second.follow(principal, {
        leaderId: LEADER,
        region: 'SG',
        permittedMarkets: ['BTC-USDT'],
        maxNotionalPerOrder: '100',
        maxAggregateExposure: '1000',
        expiresAt: futureExpiry,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_already_following' });
  });

  it('follow maps a leaked Postgres unique_violation to already_following', async () => {
    class PgLeakStore extends MemoryCopyFollowStore {
      override async listFollowsByFollower() {
        return [];
      }
      override async saveFollow(): Promise<void> {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      }
    }
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store: new PgLeakStore(),
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
    ).rejects.toMatchObject({ name: 'CopyError', code: 'trade.copy_already_following' });
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
      fillId: 'fill-cap-1',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '80',
    });
    expect(plan.notional).toBe('80');
    expect(plan.fillId).toBe('fill-cap-1');
    expect(plan.reason).toBe('within_envelope');

    await expect(
      svc.placeMirrorForFollow(principal, { followId: follow.followId, fillId: plan.fillId, leaderPaper: false }),
    ).rejects.toMatchObject({
      code: 'trade.copy_place_disabled',
    });

    await expect(
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        fillId: 'fill-cap-2',
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '80',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_cap_exceeded' });

    await expect(
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        fillId: 'fill-bad-mkt',
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
        fillId: 'fill-expired',
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.001',
        notional: '10',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_key_expired' });
  });

  it('wired placeMirror uses follower placeOrder with plan qty/price — never invents a fill', async () => {
    const placed: { qty: bigint; price: bigint; clientOrderId: string }[] = [];
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      placeMirrorEnabled: true,
      inspectMarket: async () => ({ paper: false }),
      placeFollowerOrder: async (_p, input) => {
        placed.push({ qty: input.qty, price: input.price, clientOrderId: input.clientOrderId });
        return { orderId: 'ord-1' };
      },
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-place-1',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });
    const out = await svc.placeMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-place-1',
      leaderPaper: false,
    });
    expect(out.orderId).toBe('ord-1');
    expect(out.price).toBe('5000');
    expect(placed).toHaveLength(1);
    expect(placed[0]!.qty).toBe(parseAmount('0.01'));
    expect(placed[0]!.price).toBe(parseAmount('5000'));
    expect(svc.deskStatus().autoMirrorPlace.published).toBe(true);
  });

  it('placeMirror redelivery does not place a second order', async () => {
    let places = 0;
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      placeMirrorEnabled: true,
      inspectMarket: async () => ({ paper: false }),
      placeFollowerOrder: async () => {
        places += 1;
        return { orderId: `ord-${places}` };
      },
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-once',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });
    const first = await svc.placeMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-once',
      leaderPaper: false,
    });
    const second = await svc.placeMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-once',
      leaderPaper: false,
    });
    expect(places).toBe(1);
    expect(second.orderId).toBe(first.orderId);
    expect(second.duplicate).toBe(true);
  });

  it('placeMirror refuses when the place flag is off even if the port is wired', async () => {
    let places = 0;
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      placeMirrorEnabled: false,
      placeFollowerOrder: async () => {
        places += 1;
        return { orderId: 'ord-nope' };
      },
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-flag-off',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });
    await expect(
      svc.placeMirrorForFollow(principal, { followId: follow.followId, fillId: 'fill-flag-off', leaderPaper: false }),
    ).rejects.toMatchObject({ code: 'trade.copy_place_disabled' });
    expect(places).toBe(0);
  });

  it('placeMirror refuses blank §8 fee-share — never invents leader_share_bps', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: UNPUBLISHED_COPY_FEE_SHARE_LAW,
      jurisdictionLaw: publishedJur,
      placeMirrorEnabled: true,
      placeFollowerOrder: async () => ({ orderId: 'ord-nope' }),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-blank-env',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });
    await expect(
      svc.placeMirrorForFollow(principal, { followId: follow.followId, fillId: 'fill-blank-env', leaderPaper: false }),
    ).rejects.toMatchObject({ code: 'trade.copy_fee_share_blank' });
  });

  it('placeMirror refuses a paper leader fill onto a live market', async () => {
    let places = 0;
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      placeMirrorEnabled: true,
      inspectMarket: async () => ({ paper: false }),
      placeFollowerOrder: async () => {
        places += 1;
        return { orderId: 'ord-live' };
      },
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await svc.planMirrorForFollow(principal, {
      followId: follow.followId,
      fillId: 'fill-paper',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });
    await expect(
      svc.placeMirrorForFollow(principal, { followId: follow.followId, fillId: 'fill-paper', leaderPaper: true }),
    ).rejects.toMatchObject({ code: 'trade.copy_paper_live_forbidden' });
    expect(places).toBe(0);
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
      lookupFollowerFillFee: lookupFillFee('1'),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '1000',
      maxAggregateExposure: '10000',
      expiresAt: futureExpiry,
    });
    await planOneMirror(svc, follow.followId, 'fill-ok');
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

  it('settleFeeShare omitted fillFeeAmount uses fills.fee_amount — never notional×bps', async () => {
    // 10000 bps of notional 1000 would invent protocolFee=1000 (share 500, cap 100).
    // Fill charged 0.7 — payout must be share of 0.7.
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('100'),
        rail: 'test',
        railRef: 'copy-fill-fee',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'copy-fill-fee-seed',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('10'),
      }),
    );

    const fillId = 'fill-actual-fee';
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      lookupFollowerFillFee: async (id) =>
        id === fillId
          ? {
              fillId,
              userId: FOLLOWER,
              feeAsset: 'USDT',
              feeAmount: parseAmount('0.7'),
              createdAt: new Date(Date.now() + 60_000),
            }
          : null,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '1000',
      maxAggregateExposure: '10000',
      expiresAt: futureExpiry,
    });
    await planOneMirror(svc, follow.followId, fillId);
    const settled = await svc.settleFeeShare(principal, {
      followId: follow.followId,
      fillId,
      assetId: 'USDT',
      followerFillNotional: '1000',
      protocolFeeBps: 10_000,
    });
    expect(settled.settled).toBe(true);
    expect(settled.protocolFee).toBe('0.7');
    expect(settled.cappedLeaderShare).toBe('0.35');
    expect(formatAmount((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount)).toBe('0.35');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('settleFeeShare omitted fillFeeAmount without a fill row refuses — never invents', async () => {
    const svc = new CopyService(new MemoryLedger(), {
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
    await planOneMirror(svc, follow.followId, 'fill-no-row');
    await expect(
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId: 'fill-no-row',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10_000,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
  });

  it('settleFeeShare refuses client fillFeeAmount when lookup is unset — never invents the pot', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('100'),
        rail: 'test',
        railRef: 'copy-invent-pot',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'copy-invent-pot-fee',
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
    await planOneMirror(svc, follow.followId, 'fill-invented-pot');
    await expect(
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId: 'fill-invented-pot',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
        fillFeeAmount: '1',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(0n);
  });

  it('settleFeeShare UUID trailing space / case aliases share one fill — never double-pay', async () => {
    const fillId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const pgUuidLookup: LookupFollowerFillFeePort = async (raw) => {
      const id = raw.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
      if (id.toLowerCase() !== fillId) return null;
      return {
        fillId,
        userId: FOLLOWER,
        feeAsset: 'USDT',
        feeAmount: parseAmount('1'),
        createdAt: new Date(Date.now() + 60_000),
      };
    };
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('100'),
        rail: 'test',
        railRef: 'copy-uuid-alias',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'copy-uuid-alias-fee',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('10'),
      }),
    );
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
      lookupFollowerFillFee: pgUuidLookup,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '1000',
      maxAggregateExposure: '10000',
      expiresAt: futureExpiry,
    });
    await planOneMirror(svc, follow.followId, fillId);
    const settle = (id: string) =>
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId: id,
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      });

    const first = await settle(fillId);
    expect(first.settled).toBe(true);
    expect(first.fillId).toBe(fillId);
    expect(first.cappedLeaderShare).toBe('0.5');
    const afterFirst = (await ledger.balance(userAvailable(LEADER, 'USDT'))).amount;

    const spaced = await settle(`${fillId} `);
    const cased = await settle(fillId.toUpperCase());
    expect(spaced.settled).toBe(true);
    expect(cased.settled).toBe(true);
    expect(spaced.fillId).toBe(fillId);
    expect(cased.fillId).toBe(fillId);
    expect(spaced.cappedLeaderShare).toBe(first.cappedLeaderShare);
    expect(cased.cappedLeaderShare).toBe(first.cappedLeaderShare);

    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(afterFirst);
    const stats = await store.getPeriodStats(`${LEADER}:${FOLLOWER}`);
    expect(stats.roundTrips).toBe(1);
    expect(stats.earningsPaid).toBe(parseAmount('0.5'));
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
      fillId: 'fill-restart-1',
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
        fillId: 'fill-restart-2',
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '970',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_cap_exceeded' });
  });

  /**
   * Exposure is a cumulative session BUDGET, not a net position.
   *
   * The real bug was two expressions that disagreed about the same number:
   * `planMirror` checked `currentExposure + observation.notional` while
   * `CopyService` separately wrote `current + plan.notional`. They happened to
   * agree; nothing made them. The approved value now rides on the plan.
   *
   * The arithmetic itself is deliberately unchanged, and this test says why:
   * the envelope mirrors `SessionKeyLib`'s `uint128 spendLimitWei`, documented
   * as the cumulative cap on what a session may EVER move. Netting a sell
   * against a buy here would approve mirrors the on-chain account rejects.
   */
  it('a sell spends budget like a buy — the cap is cumulative, not net', async () => {
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT', 'ETH-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '250',
      expiresAt: futureExpiry,
    });
    let fillSeq = 0;
    const mirror = (side: 'buy' | 'sell', notional: string, marketId = 'BTC-USDT') =>
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        fillId: `fill-side-${++fillSeq}`,
        marketId,
        side,
        qty: '0.01',
        notional,
      });

    const bought = await mirror('buy', '100');
    expect(bought.nextExposure).toBe('100');

    // A closing sell does NOT hand budget back.
    const sold = await mirror('sell', '100');
    expect(sold.nextExposure).toBe('200');
    expect(await store.getExposure(follow.followId)).toBe(parseAmount('200'));

    // And alternating sides across permitted markets cannot evade the cap —
    // a net-position model would let this run forever.
    await expect(mirror('buy', '100', 'ETH-USDT')).rejects.toMatchObject({ code: 'trade.copy_cap_exceeded' });
  });

  /**
   * Redelivered leader fills must not double-count exposure.
   *
   * Every other money path in svc-trade keys on fillId (ledger trade.fill,
   * fee-share settle). Mirror used to plan from qty/notional alone — a journal
   * redelivery of the same leader fill would spend the session budget twice.
   */
  it('a redelivered leader fill returns the prior plan and does not bump exposure twice', async () => {
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '500',
      expiresAt: futureExpiry,
    });

    const input = {
      followId: follow.followId,
      fillId: 'leader-fill-abc',
      marketId: 'BTC-USDT' as const,
      side: 'buy' as const,
      qty: '0.01',
      notional: '80',
    };

    const first = await svc.planMirrorForFollow(principal, input);
    expect(first.fillId).toBe('leader-fill-abc');
    expect(first.notional).toBe('80');
    expect(first.nextExposure).toBe('80');
    expect(formatAmount(await store.getExposure(follow.followId))).toBe('80');

    // Same fillId again (redelivery) — prior plan, exposure unchanged.
    const second = await svc.planMirrorForFollow(principal, input);
    expect(second).toEqual(first);
    expect(formatAmount(await store.getExposure(follow.followId))).toBe('80');

    // Stored claim is the durable source of truth across restarts.
    const claimed = await store.getMirroredFill(follow.followId, 'leader-fill-abc');
    expect(claimed).not.toBeNull();
    expect(formatAmount(claimed!.notional)).toBe('80');

    // A different fill still spends budget (not a blanket freeze).
    const third = await svc.planMirrorForFollow(principal, {
      ...input,
      fillId: 'leader-fill-def',
      notional: '50',
    });
    expect(third.nextExposure).toBe('130');
    expect(formatAmount(await store.getExposure(follow.followId))).toBe('130');
  });

  it('mirror refuses a blank fillId rather than inventing one', async () => {
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '500',
      expiresAt: futureExpiry,
    });
    await expect(
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        fillId: '   ',
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '10',
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_envelope_invalid' });
  });

  it('concurrent redeliveries of the same fill claim exposure once', async () => {
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '500',
      expiresAt: futureExpiry,
    });
    const input = {
      followId: follow.followId,
      fillId: 'leader-fill-race',
      marketId: 'BTC-USDT' as const,
      side: 'buy' as const,
      qty: '0.01',
      notional: '75',
    };

    const results = await Promise.all([
      svc.planMirrorForFollow(principal, input),
      svc.planMirrorForFollow(principal, input),
      svc.planMirrorForFollow(principal, input),
    ]);

    for (const r of results) {
      expect(r.fillId).toBe('leader-fill-race');
      expect(r.notional).toBe('75');
      expect(r.nextExposure).toBe('75');
    }
    expect(formatAmount(await store.getExposure(follow.followId))).toBe('75');
  });

  /**
   * The churn counters must survive an unfollow.
   *
   * They are keyed `leader:follower` because the spec's unit is the pair and
   * the period, not the envelope. `unfollow` is unilateral, needs no law and is
   * always allowed — so clearing them there would make the abuse brake resettable
   * for the price of two API calls: farm to the cap, unfollow, re-follow, repeat.
   */
  it('re-following does not reset a spent earnings cap', async () => {
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const envelope = {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '100',
      expiresAt: futureExpiry,
    };
    const follow = await svc.follow(principal, envelope);
    const key = `${LEADER}:${FOLLOWER}`;
    await store.setPeriodStats(key, { earningsPaid: parseAmount('100'), roundTrips: 42 });

    await svc.unfollow(principal, { followId: follow.followId });
    await svc.follow(principal, envelope);

    expect(await store.getPeriodStats(key)).toEqual({ earningsPaid: parseAmount('100'), roundTrips: 42 });
  });

  /**
   * CONCURRENT settleFeeShare must not breach earningsCapPerFollower.
   *
   * Reachable break (pre-fix): two settlers both read earningsPaid=0, both
   * attribute a full share under cap, both post (different fillIds → different
   * ledger business keys → both move money), both write counters. Cap breached;
   * ledger records the over-payment. Assertions are BALANCES, not response codes.
   */
  it('concurrent settleFeeShare never pays more than earningsCapPerFollower', async () => {
    const cap = '1';
    const tightCap: CopyFeeShareLaw = {
      published: true,
      leaderShareBps: 5_000,
      earningsCapPerFollower: cap,
      decayRoundTrips: 100,
      decayShareBps: 1_000,
    };
    const ledger = new MemoryLedger();
    // Seed enough house trade fees that a double-pay would succeed in the ledger
    // if the counter race let both through (each intended share ≈ 5 under this
    // notional; cap only admits 1 total).
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('1000'),
        rail: 'test',
        railRef: 'copy-race-seed',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'race-seed-fee',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('100'),
      }),
    );

    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(ledger, {
      feeShareLaw: tightCap,
      jurisdictionLaw: publishedJur,
      store,
      lookupFollowerFillFee: lookupFillFee('10'),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100000',
      maxAggregateExposure: '100000',
      expiresAt: futureExpiry,
    });
    await planOneMirror(svc, follow.followId, 'fill-race-a');
    await planOneMirror(svc, follow.followId, 'fill-race-b');

    // notional 10000, fee 10 bps → protocol fee 10; share 50% → 5 intended each.
    // Cap is 1 — without atomic reserve both concurrent settlers pay 1 → total 2.
    const settle = (fillId: string) =>
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId,
        assetId: 'USDT',
        followerFillNotional: '10000',
        protocolFeeBps: 10,
      });

    const results = await Promise.all([settle('fill-race-a'), settle('fill-race-b')]);
    const settledCount = results.filter((r) => r.settled).length;
    expect(settledCount).toBe(1);
    expect(results.filter((r) => !r.settled).every((r) => r.skippedReason === 'cap_reached')).toBe(true);

    const leaderBal = (await ledger.balance(userAvailable(LEADER, 'USDT'))).amount;
    expect(leaderBal).toBe(parseAmount(cap));
    expect(leaderBal <= parseAmount(cap)).toBe(true);

    const stats = await store.getPeriodStats(`${LEADER}:${FOLLOWER}`);
    expect(stats.earningsPaid).toBe(parseAmount(cap));
    // Both attempts count as round-trips (decay still advances on the skip).
    expect(stats.roundTrips).toBe(2);
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('eight concurrent settles still hold the earnings cap', async () => {
    const cap = '1';
    const tightCap: CopyFeeShareLaw = {
      published: true,
      leaderShareBps: 5_000,
      earningsCapPerFollower: cap,
      decayRoundTrips: 1000,
      decayShareBps: 1_000,
    };
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('5000'),
        rail: 'test',
        railRef: 'copy-race8-seed',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'race8-seed-fee',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('500'),
      }),
    );
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(ledger, {
      feeShareLaw: tightCap,
      jurisdictionLaw: publishedJur,
      store,
      lookupFollowerFillFee: lookupFillFee('10'),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100000',
      maxAggregateExposure: '100000',
      expiresAt: futureExpiry,
    });
    for (let i = 0; i < 8; i += 1) {
      await planOneMirror(svc, follow.followId, `fill-race8-${i}`);
    }

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        svc.settleFeeShare(principal, {
          followId: follow.followId,
          fillId: `fill-race8-${i}`,
          assetId: 'USDT',
          followerFillNotional: '10000',
          protocolFeeBps: 10,
        }),
      ),
    );
    expect(results.filter((r) => r.settled)).toHaveLength(1);
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(parseAmount(cap));
    expect((await store.getPeriodStats(`${LEADER}:${FOLLOWER}`)).earningsPaid).toBe(parseAmount(cap));
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('reserve rolls back when ledger post fails — cap headroom restored', async () => {
    const cap = '10';
    const feeLaw: CopyFeeShareLaw = {
      published: true,
      leaderShareBps: 5_000,
      earningsCapPerFollower: cap,
      decayRoundTrips: 100,
      decayShareBps: 1_000,
    };
    // Empty house fees → sweep/payout fails; reservation must release.
    const ledger = new MemoryLedger();
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(ledger, {
      feeShareLaw: feeLaw,
      jurisdictionLaw: publishedJur,
      store,
      lookupFollowerFillFee: lookupFillFee('10'),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100000',
      maxAggregateExposure: '100000',
      expiresAt: futureExpiry,
    });
    await planOneMirror(svc, follow.followId, 'fill-ledger-fail');

    await expect(
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId: 'fill-ledger-fail',
        assetId: 'USDT',
        followerFillNotional: '10000',
        protocolFeeBps: 10,
      }),
    ).rejects.toBeTruthy();

    const stats = await store.getPeriodStats(`${LEADER}:${FOLLOWER}`);
    // Round-trip still counted; earnings reservation released.
    expect(stats.earningsPaid).toBe(0n);
    expect(stats.roundTrips).toBe(1);
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(0n);
  });

  /**
   * Concurrent mirrors near the aggregate cap must not both clear a stale read.
   * maxAggregate=150; two concurrent notionals of 100 would overshoot to 200
   * under read-modify-write setExposure — atomic add admits only one.
   */
  it('concurrent planMirrorForFollow never exceeds maxAggregateExposure', async () => {
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(new MemoryLedger(), {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT', 'ETH-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '150',
      expiresAt: futureExpiry,
    });

    const attempts = await Promise.allSettled([
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        fillId: 'fill-conc-btc',
        marketId: 'BTC-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '100',
      }),
      svc.planMirrorForFollow(principal, {
        followId: follow.followId,
        fillId: 'fill-conc-eth',
        marketId: 'ETH-USDT',
        side: 'buy',
        qty: '0.01',
        notional: '100',
      }),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'trade.copy_cap_exceeded' });

    const exposure = await store.getExposure(follow.followId);
    expect(exposure).toBe(parseAmount('100'));
    expect(exposure <= parseAmount('150')).toBe(true);
  });

  /**
   * Same fillId redelivery must not re-reserve earnings / re-bump round-trips.
   * Mirror path already claims fillId (#1199); settle had only ledger keys —
   * redelivery re-ran reserveEarnings and poisoned the period counters.
   */
  it('redelivered settleFeeShare does not re-bump period stats or double-pay', async () => {
    const ledger = new MemoryLedger();
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('100'),
        rail: 'test',
        railRef: 'copy-redeliver-seed',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'redeliver-seed-fee',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('10'),
      }),
    );

    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
      lookupFollowerFillFee: lookupFillFee('1'),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '1000',
      maxAggregateExposure: '10000',
      expiresAt: futureExpiry,
    });
    await planOneMirror(svc, follow.followId, 'fill-once-only');

    const input = {
      followId: follow.followId,
      fillId: 'fill-once-only',
      assetId: 'USDT',
      followerFillNotional: '1000',
      protocolFeeBps: 10,
    } as const;

    const first = await svc.settleFeeShare(principal, input);
    expect(first.settled).toBe(true);
    expect(first.cappedLeaderShare).toBe('0.5');

    const afterFirst = await store.getPeriodStats(`${LEADER}:${FOLLOWER}`);
    expect(afterFirst.earningsPaid).toBe(parseAmount('0.5'));
    expect(afterFirst.roundTrips).toBe(1);

    const leaderAfterFirst = (await ledger.balance(userAvailable(LEADER, 'USDT'))).amount;

    // Redeliver the same fill — must be a no-op on counters and balances.
    const second = await svc.settleFeeShare(principal, input);
    expect(second.settled).toBe(true);
    expect(second.cappedLeaderShare).toBe(first.cappedLeaderShare);
    expect(second.fillId).toBe(first.fillId);

    const afterSecond = await store.getPeriodStats(`${LEADER}:${FOLLOWER}`);
    expect(afterSecond.earningsPaid).toBe(afterFirst.earningsPaid);
    expect(afterSecond.roundTrips).toBe(1);

    const leaderAfterSecond = (await ledger.balance(userAvailable(LEADER, 'USDT'))).amount;
    expect(leaderAfterSecond).toBe(leaderAfterFirst);
    expect(ledger.reconcile()).toEqual({ ok: true });

    // Concurrent redelivery of the same fill must still hold.
    const concurrent = await Promise.all([
      svc.settleFeeShare(principal, input),
      svc.settleFeeShare(principal, input),
      svc.settleFeeShare(principal, input),
    ]);
    expect(concurrent.every((r) => r.settled && r.cappedLeaderShare === first.cappedLeaderShare)).toBe(true);
    const afterConcurrent = await store.getPeriodStats(`${LEADER}:${FOLLOWER}`);
    expect(afterConcurrent.roundTrips).toBe(1);
    expect(afterConcurrent.earningsPaid).toBe(parseAmount('0.5'));
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(leaderAfterFirst);
  });

  async function seedHouseFees(ledger: MemoryLedger, railRef: string, house = '10') {
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('1000'),
        rail: 'test',
        railRef,
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: `${railRef}-fee`,
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount(house),
      }),
    );
  }

  const copyEnvelope = {
    region: 'SG' as const,
    permittedMarkets: ['BTC-USDT'],
    maxNotionalPerOrder: '1000',
    maxAggregateExposure: '10000',
    expiresAt: futureExpiry,
  };

  async function planOneMirror(svc: CopyService, followId: string, fillId: string) {
    await svc.planMirrorForFollow(principal, {
      followId,
      fillId,
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.001',
      notional: '10',
    });
  }

  it('settleFeeShare refuses after envelope expiry — never pays a lapsed follow', async () => {
    let now = new Date('2026-06-01T00:00:00.000Z');
    const ledger = new MemoryLedger();
    await seedHouseFees(ledger, 'copy-expired-follow');
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      now: () => now,
      lookupFollowerFillFee: lookupFillFee('1'),
    });
    const follow = await svc.follow(principal, {
      leaderId: LEADER,
      ...copyEnvelope,
      expiresAt: '2026-06-02T00:00:00.000Z',
    });
    await planOneMirror(svc, follow.followId, 'fill-after-expiry');
    now = new Date('2026-06-03T00:00:00.000Z');

    await expect(
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId: 'fill-after-expiry',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_key_expired' });
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(0n);
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('settleFeeShare refuses a second leader on the same fill — one fill one share', async () => {
    const ledger = new MemoryLedger();
    await seedHouseFees(ledger, 'copy-two-leaders', '100');
    // Extra rewards so a second payout would succeed if the once-key leaked.
    await ledger.post(
      recipes.sweepFeesToRewards({
        windowId: 'two-leader-seed',
        sourceModule: 'trade',
        assetId: 'USDT',
        amount: parseAmount('20'),
      }),
    );
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      lookupFollowerFillFee: lookupFillFee('1'),
    });
    const followA = await svc.follow(principal, { leaderId: LEADER, ...copyEnvelope });
    const followB = await svc.follow(principal, { leaderId: LEADER_B, ...copyEnvelope });
    await planOneMirror(svc, followA.followId, 'shared-fill');
    await planOneMirror(svc, followB.followId, 'shared-fill');

    const first = await svc.settleFeeShare(principal, {
      followId: followA.followId,
      fillId: 'shared-fill',
      assetId: 'USDT',
      followerFillNotional: '1000',
      protocolFeeBps: 10,
    });
    expect(first.settled).toBe(true);
    expect(first.cappedLeaderShare).toBe('0.5');

    await expect(
      svc.settleFeeShare(principal, {
        followId: followB.followId,
        fillId: 'shared-fill',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });

    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(parseAmount('0.5'));
    expect((await ledger.balance(userAvailable(LEADER_B, 'USDT'))).amount).toBe(0n);
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('settleFeeShare refuses a fill from before the follow — never shares pre-follow volume', async () => {
    const followedAt = new Date('2026-08-01T00:00:00.000Z');
    const ledger = new MemoryLedger();
    await seedHouseFees(ledger, 'copy-pre-follow');
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      now: () => followedAt,
      lookupFollowerFillFee: async (fillId) => ({
        fillId,
        userId: FOLLOWER,
        feeAsset: 'USDT',
        feeAmount: parseAmount('1'),
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    });
    const follow = await svc.follow(principal, { leaderId: LEADER, ...copyEnvelope });
    await planOneMirror(svc, follow.followId, 'pre-follow-fill');

    await expect(
      svc.settleFeeShare(principal, {
        followId: follow.followId,
        fillId: 'pre-follow-fill',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(0n);
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('settleFeeShare post-then-throw keeps the fill claim — second leader does not pay', async () => {
    class SweepOkPayoutThrowLedger extends MemoryLedger {
      payoutCalls = 0;
      override async post(request: Parameters<MemoryLedger['post']>[0]) {
        if (request.reason === 'trade.copy.fee_share') {
          this.payoutCalls += 1;
          throw new Error('payout threw after sweep');
        }
        return super.post(request);
      }
    }
    const ledger = new SweepOkPayoutThrowLedger();
    await seedHouseFees(ledger, 'copy-post-then-throw', '100');
    await ledger.post(
      recipes.sweepFeesToRewards({
        windowId: 'post-then-throw-seed',
        sourceModule: 'trade',
        assetId: 'USDT',
        amount: parseAmount('20'),
      }),
    );
    const store = new MemoryCopyFollowStore();
    const svc = new CopyService(ledger, {
      feeShareLaw: publishedFee,
      jurisdictionLaw: publishedJur,
      store,
      lookupFollowerFillFee: lookupFillFee('1'),
    });
    const followA = await svc.follow(principal, { leaderId: LEADER, ...copyEnvelope });
    const followB = await svc.follow(principal, { leaderId: LEADER_B, ...copyEnvelope });
    await planOneMirror(svc, followA.followId, 'fill-post-then-throw');
    await planOneMirror(svc, followB.followId, 'fill-post-then-throw');

    await expect(
      svc.settleFeeShare(principal, {
        followId: followA.followId,
        fillId: 'fill-post-then-throw',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      }),
    ).rejects.toThrow(/payout threw after sweep/);
    expect(ledger.payoutCalls).toBe(1);
    expect(await store.getSettledFeeShare(followA.followId, 'fill-post-then-throw')).not.toBeNull();

    await expect(
      svc.settleFeeShare(principal, {
        followId: followB.followId,
        fillId: 'fill-post-then-throw',
        assetId: 'USDT',
        followerFillNotional: '1000',
        protocolFeeBps: 10,
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
    expect(ledger.payoutCalls).toBe(1);
    expect((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount).toBe(0n);
    expect((await ledger.balance(userAvailable(LEADER_B, 'USDT'))).amount).toBe(0n);
    expect(ledger.reconcile()).toEqual({ ok: true });
  });
});
