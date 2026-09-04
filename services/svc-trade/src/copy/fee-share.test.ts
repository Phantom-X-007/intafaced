import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount, recipes, userAvailable, formatAmount, houseFees } from '@intafaced/ledger-client';
import {
  attributeCopyFeeShare,
  canonicalizeCopyFillId,
  planCopyFeeShareSettle,
  postCopyFeeShareSettle,
  refusePnlLinkedCopyFee,
} from './fee-share.js';
import { UNPUBLISHED_COPY_FEE_SHARE_LAW, type CopyFeeShareLaw } from './fee-share-law.js';
import { CopyError } from './errors.js';

const LEADER = '00000000-0000-4000-8000-0000000000aa';
const FOLLOWER = '00000000-0000-4000-8000-0000000000bb';

const published: CopyFeeShareLaw = {
  published: true,
  leaderShareBps: 5_000, // 50% of protocol fee
  earningsCapPerFollower: '10',
  decayRoundTrips: 2,
  decayShareBps: 1_000,
};

describe('attributeCopyFeeShare', () => {
  it('refuses blank §8 law — never invents leader_share_bps', () => {
    try {
      attributeCopyFeeShare({
        law: UNPUBLISHED_COPY_FEE_SHARE_LAW,
        fillId: 'f1',
        leaderId: LEADER,
        followerId: FOLLOWER,
        assetId: 'USDT',
        followerFillNotional: parseAmount('1000'),
        protocolFeeBps: 10,
        roundTripsThisPeriod: 0,
        earningsPaidThisPeriod: 0n,
        feeShareKilled: false,
      });
      expect.unreachable('should refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(CopyError);
      expect((err as CopyError).code).toBe('trade.copy_fee_share_blank');
    }
  });

  it('shares protocol fee only — no P&L in the formula', () => {
    // settled fill fee 1; share 5000 bps → 0.5. Notional×bps is not the pot.
    const a = attributeCopyFeeShare({
      law: published,
      fillId: 'f2',
      leaderId: LEADER,
      followerId: FOLLOWER,
      assetId: 'USDT',
      followerFillNotional: parseAmount('1000'),
      protocolFeeBps: 10,
      fillFeeAmount: parseAmount('1'),
      roundTripsThisPeriod: 0,
      earningsPaidThisPeriod: 0n,
      feeShareKilled: false,
    });
    expect(formatAmount(a.protocolFee)).toBe('1');
    expect(a.appliedShareBps).toBe(5_000);
    expect(formatAmount(a.cappedLeaderShare)).toBe('0.5');
    expect(a.skippedReason).toBeNull();
  });

  it('uses fillFeeAmount (settled fee) over notional×bps invent', () => {
    // Notional path would invent 1 USDT fee; real fill collected 0.7.
    const a = attributeCopyFeeShare({
      law: published,
      fillId: 'f2-fill-fee',
      leaderId: LEADER,
      followerId: FOLLOWER,
      assetId: 'USDT',
      followerFillNotional: parseAmount('1000'),
      protocolFeeBps: 10,
      fillFeeAmount: parseAmount('0.7'),
      roundTripsThisPeriod: 0,
      earningsPaidThisPeriod: 0n,
      feeShareKilled: false,
    });
    expect(formatAmount(a.protocolFee)).toBe('0.7');
    expect(formatAmount(a.cappedLeaderShare)).toBe('0.35');
  });

  it('refuses omitted fillFeeAmount — never invents protocolFee from notional×bps', () => {
    // 10000 bps of notional 1000 would invent protocolFee=1000; fill charged 0.7.
    try {
      attributeCopyFeeShare({
        law: published,
        fillId: 'f2-omit-fill-fee',
        leaderId: LEADER,
        followerId: FOLLOWER,
        assetId: 'USDT',
        followerFillNotional: parseAmount('1000'),
        protocolFeeBps: 10_000,
        roundTripsThisPeriod: 0,
        earningsPaidThisPeriod: 0n,
        feeShareKilled: false,
      });
      expect.unreachable('should refuse rather than invent protocolFee from notional');
    } catch (err) {
      expect(err).toBeInstanceOf(CopyError);
      expect((err as CopyError).code).toBe('trade.copy_settle_refused');
    }
  });

  it('applies earnings cap per follower', () => {
    const a = attributeCopyFeeShare({
      law: published,
      fillId: 'f3',
      leaderId: LEADER,
      followerId: FOLLOWER,
      assetId: 'USDT',
      followerFillNotional: parseAmount('100000'),
      protocolFeeBps: 10,
      fillFeeAmount: parseAmount('100'),
      roundTripsThisPeriod: 0,
      earningsPaidThisPeriod: parseAmount('9.8'),
      feeShareKilled: false,
    });
    // protocol fee 100; 50% = 50; remaining to cap = 0.2
    expect(formatAmount(a.cappedLeaderShare)).toBe('0.2');
  });

  it('decays share after round-trip threshold', () => {
    const a = attributeCopyFeeShare({
      law: published,
      fillId: 'f4',
      leaderId: LEADER,
      followerId: FOLLOWER,
      assetId: 'USDT',
      followerFillNotional: parseAmount('1000'),
      protocolFeeBps: 10,
      fillFeeAmount: parseAmount('1'),
      roundTripsThisPeriod: 2,
      earningsPaidThisPeriod: 0n,
      feeShareKilled: false,
    });
    expect(a.appliedShareBps).toBe(1_000);
    expect(formatAmount(a.cappedLeaderShare)).toBe('0.1');
  });

  it('refuses when fee-share killed', () => {
    try {
      attributeCopyFeeShare({
        law: published,
        fillId: 'f5',
        leaderId: LEADER,
        followerId: FOLLOWER,
        assetId: 'USDT',
        followerFillNotional: parseAmount('1000'),
        protocolFeeBps: 10,
        roundTripsThisPeriod: 0,
        earningsPaidThisPeriod: 0n,
        feeShareKilled: true,
      });
      expect.unreachable('should refuse');
    } catch (err) {
      expect((err as CopyError).code).toBe('trade.copy_fee_share_killed');
    }
  });
});

describe('planCopyFeeShareSettle + ledger', () => {
  it('copy-fee / copy-leader-share keys canonicalize UUID case and trailing space', () => {
    const attr = (fillId: string) =>
      attributeCopyFeeShare({
        law: published,
        fillId,
        leaderId: LEADER,
        followerId: FOLLOWER,
        assetId: 'USDT',
        followerFillNotional: parseAmount('1000'),
        protocolFeeBps: 10,
        fillFeeAmount: parseAmount('1'),
        roundTripsThisPeriod: 0,
        earningsPaidThisPeriod: 0n,
        feeShareKilled: false,
      });
    const lower = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const a = planCopyFeeShareSettle(attr(lower));
    const b = planCopyFeeShareSettle(attr(`${lower.toUpperCase()} `));
    expect(canonicalizeCopyFillId(`${lower.toUpperCase()} `)).toBe(lower);
    expect(a.sweep.idempotencyKey).toBe(b.sweep.idempotencyKey);
    expect(a.payout.idempotencyKey).toBe(b.payout.idempotencyKey);
    expect(a.sweep.idempotencyKey).toContain(`copy-fee:${lower}`);
    expect(a.payout.idempotencyKey).toBe(`reward:copy-leader-share:${lower}:${LEADER}`);
  });

  it('posts via ledger-client sweepFeesToRewards + rewardPay only', async () => {
    const ledger = new MemoryLedger();
    // Seed house trade fees (protocol fee already collected).
    await ledger.post(
      recipes.deposit({
        userId: FOLLOWER,
        assetId: 'USDT',
        amount: parseAmount('100'),
        rail: 'test',
        railRef: 'copy-fee-seed',
      }),
    );
    await ledger.post(
      recipes.feeCharge({
        mode: 'asset',
        chargeId: 'seed-fee',
        userId: FOLLOWER,
        module: 'trade',
        assetId: 'USDT',
        amount: parseAmount('10'),
      }),
    );

    const attribution = attributeCopyFeeShare({
      law: published,
      fillId: 'fill-copy-1',
      leaderId: LEADER,
      followerId: FOLLOWER,
      assetId: 'USDT',
      followerFillNotional: parseAmount('1000'),
      protocolFeeBps: 10,
      fillFeeAmount: parseAmount('1'),
      roundTripsThisPeriod: 0,
      earningsPaidThisPeriod: 0n,
      feeShareKilled: false,
    });
    const plan = planCopyFeeShareSettle(attribution);
    await postCopyFeeShareSettle(ledger, plan);

    expect(formatAmount((await ledger.balance(userAvailable(LEADER, 'USDT'))).amount)).toBe('0.5');
    expect(formatAmount((await ledger.balance(userAvailable(FOLLOWER, 'USDT'))).amount)).toBe('90');
    expect(plan.payout.idempotencyKey).toBe(`reward:copy-leader-share:fill-copy-1:${LEADER}`);
    expect(ledger.reconcile()).toEqual({ ok: true });
    // House still holds residual fees after the share sweep.
    expect(formatAmount((await ledger.balance(houseFees('trade', 'USDT'))).amount)).toBe('9.5');
  });
});

describe('refusePnlLinkedCopyFee', () => {
  it('never allows performance / HWM fees', () => {
    expect(() => refusePnlLinkedCopyFee()).toThrow(CopyError);
    try {
      refusePnlLinkedCopyFee();
    } catch (err) {
      expect((err as CopyError).code).toBe('trade.copy_pnl_fee_forbidden');
    }
  });
});
