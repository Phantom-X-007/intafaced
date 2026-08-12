/**
 * D26-P1-T1f / MVP-6 — funding accrues and long/short nets to zero.
 *
 * Done bar: after the real tick path (`runFundingTick`), sum of per-position
 * funding nets is 0 on every settled book. Rates come from an external source
 * (never invented). Bound is a test fixture only (owner residual D2).
 */
import { describe, expect, it } from 'vitest';
import { parseAmount as amt, type PostRequest } from '@intafaced/ledger-client';
import {
  assertFundingNetsZero,
  memoryFundingMarginApplier,
  memoryFundingPeriodStore,
  netFundingPaid,
  runFundingTick,
  sumFundingNets,
  type FundingRateSource,
  type FundingPositionLoader,
} from './funding-tick.js';
import { planFundingSettlement, type FundingOpenPosition } from './funding-settlement.js';

/** Test-only magnitude bound — NOT product law (owner residual D2). */
const FIXTURE_FUNDING_MAX_ABS = '1';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

function pos(positionId: string, side: 'long' | 'short', size: string, userId: string, entry = '50000'): FundingOpenPosition {
  return {
    positionId,
    userId,
    side,
    size: amt(size),
    entryPrice: amt(entry),
    marginAsset: 'USDT',
  };
}

function fixedRate(rate: string, periodId: string): FundingRateSource {
  return {
    async quote({ marketId }) {
      return { rate, periodId, marketId };
    },
  };
}

function positionsOf(rows: FundingOpenPosition[]): FundingPositionLoader {
  return {
    async listOpenForMarket() {
      return rows;
    },
  };
}

function recordingLedger() {
  const posts: PostRequest[] = [];
  return {
    posts,
    ledger: {
      async post(req: PostRequest) {
        posts.push(req);
        return { id: `tx-${posts.length}`, idempotencyKey: req.idempotencyKey } as never;
      },
    },
  };
}

async function settleTick(rate: string, periodId: string, book: FundingOpenPosition[]) {
  const margins = memoryFundingMarginApplier();
  const { ledger, posts } = recordingLedger();
  const result = await runFundingTick(
    {
      rates: fixedRate(rate, periodId),
      positions: positionsOf(book),
      periods: memoryFundingPeriodStore(),
      margins,
      maxAbsRate: FIXTURE_FUNDING_MAX_ABS,
      ledger,
    },
    'm1',
  );
  return { result, margins, posts };
}

describe('D26-P1-T1f — funding nets zero on the real tick path', () => {
  it('balanced 1:1 book: long paid + short received = 0', async () => {
    const { result, margins, posts } = await settleTick('0.0001', 'm1:netzero-1x1', [
      pos('plong', 'long', '1', A),
      pos('pshort', 'short', '1', B),
    ]);
    expect(result.status).toBe('settled');
    expect(posts).toHaveLength(1);
    const longPaid = margins.paidByPosition('plong');
    const shortPaid = margins.paidByPosition('pshort');
    expect(longPaid).toBe(amt('5'));
    expect(shortPaid).toBe(-amt('5'));
    expect(longPaid + shortPaid).toBe(0n);
    expect(
      sumFundingNets([
        { positionId: 'plong', paid: longPaid },
        { positionId: 'pshort', paid: shortPaid },
      ]),
    ).toBe(0n);
  });

  it('negative rate flips payer; still nets to zero', async () => {
    const { result, margins } = await settleTick('-0.0001', 'm1:netzero-neg', [
      pos('plong', 'long', '1', A),
      pos('pshort', 'short', '1', B),
    ]);
    expect(result.status).toBe('settled');
    // Shorts pay longs.
    expect(margins.paidByPosition('pshort') > 0n).toBe(true);
    expect(margins.paidByPosition('plong') < 0n).toBe(true);
    expect(margins.paidByPosition('plong') + margins.paidByPosition('pshort')).toBe(0n);
  });

  it('asymmetric multi-position book still conserves (matchable notional)', async () => {
    // L = 3×50k, S = 2×50k → matchable = 2×50k; total transfer = 0.0001 * 100000 = 10
    const book = [pos('L1', 'long', '2', A), pos('L2', 'long', '1', B), pos('S1', 'short', '1', C), pos('S2', 'short', '1', D)];
    const { result, margins, posts } = await settleTick('0.0001', 'm1:netzero-asym', book);
    expect(result.status).toBe('settled');
    expect(posts.length).toBeGreaterThan(1);

    const nets = ['L1', 'L2', 'S1', 'S2'].map((id) => ({
      positionId: id,
      paid: margins.paidByPosition(id),
    }));
    assertFundingNetsZero(nets);
    expect(sumFundingNets(nets)).toBe(0n);

    // Integer division can leave ≤1 wei of dust vs theoretical |rate|×matchable
    // (10 quote). Done bar is conservation, not a second invent of the total.
    const paidOut = nets.filter((n) => n.paid > 0n).reduce((a, n) => a + n.paid, 0n);
    const received = nets.filter((n) => n.paid < 0n).reduce((a, n) => a + n.paid, 0n);
    expect(paidOut).toBe(-received);
    expect(paidOut > 0n).toBe(true);
    expect(amt('10') - paidOut <= 1n).toBe(true);
  });

  it('planner legs → netFundingPaid already sum to zero before the tick posts', () => {
    const legs = planFundingSettlement({
      periodId: 'm1:planner-zero',
      marketId: 'm1',
      rate: '0.0001',
      maxAbsRate: FIXTURE_FUNDING_MAX_ABS,
      positions: [pos('L1', 'long', '3', A), pos('L2', 'long', '1', B), pos('S1', 'short', '2', C), pos('S2', 'short', '2', D)],
    });
    expect(legs.length).toBeGreaterThan(0);
    const nets = netFundingPaid(legs);
    assertFundingNetsZero(nets);
    expect(sumFundingNets(nets)).toBe(0n);
  });

  it('ledger posts balance: every entry amount is a transfer (payer total = payee total)', async () => {
    const { result, posts, margins } = await settleTick('0.0001', 'm1:netzero-ledger', [
      pos('L1', 'long', '1', A),
      pos('L2', 'long', '1', B),
      pos('S1', 'short', '1', C),
      pos('S2', 'short', '1', D),
    ]);
    expect(result.status).toBe('settled');
    let ledgerTransfer = 0n;
    for (const req of posts) {
      // futuresFundingPay: two legs of equal amount (credit collateral / debit available).
      expect(req.entries).toHaveLength(2);
      expect(req.entries[0]!.amount).toBe(req.entries[1]!.amount);
      ledgerTransfer += req.entries[0]!.amount as bigint;
    }
    const marginPaid = ['L1', 'L2', 'S1', 'S2']
      .map((id) => margins.paidByPosition(id))
      .filter((p) => p > 0n)
      .reduce((a, p) => a + p, 0n);
    expect(marginPaid).toBe(ledgerTransfer);
    expect(sumFundingNets(['L1', 'L2', 'S1', 'S2'].map((id) => ({ positionId: id, paid: margins.paidByPosition(id) })))).toBe(0n);
  });

  it('assertFundingNetsZero refuses a non-conserving net list', () => {
    expect(() =>
      assertFundingNetsZero([
        { positionId: 'a', paid: amt('5') },
        { positionId: 'b', paid: -amt('3') },
      ]),
    ).toThrow(/sum to zero/);
  });
});
