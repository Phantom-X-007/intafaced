import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt, sum } from '@intafaced/ledger-client';
import { allocate, commitHeadroom, tierFor, AllocationError, type RaiseTerms } from './allocation.js';

/**
 * ALLOCATION — the arithmetic of who gets what.
 *
 * Pure, so these are the tests that matter most: a disputed allocation is
 * settled by recomputing it from the raise's published terms, and that is only
 * a defence if the computation is pinned down here rather than discovered in
 * production.
 */

const A = 'alice';
const B = 'bob';
const C = 'carol';

const presale = (over: Partial<RaiseTerms> = {}): RaiseTerms => ({
  mode: 'presale',
  saleSupply: amt('1000'),
  price: amt('2'), // 2 USDT per token
  softCap: amt('100'),
  ...over,
});

const fair = (over: Partial<RaiseTerms> = {}): RaiseTerms => ({
  mode: 'fair',
  saleSupply: amt('1000'),
  price: null,
  softCap: amt('100'),
  ...over,
});

describe('allocate — the soft cap', () => {
  it('fails a raise that did not clear, and refunds every contributor in full', () => {
    const result = allocate(presale({ softCap: amt('500') }), [
      { userId: A, amount: amt('100') },
      { userId: B, amount: amt('200') },
    ]);

    expect(result.outcome).toBe('failed');
    expect(result.lines.map((l) => formatAmount(l.refund))).toEqual(['100', '200']);
    expect(result.lines.every((l) => l.saleAmount === 0n)).toBe(true);
    // The whole supply goes home. Nothing was sold, so nothing was kept.
    expect(formatAmount(result.unsoldSupply)).toBe('1000');
  });

  it('fails a raise nobody entered', () => {
    const result = allocate(presale(), []);
    expect(result.outcome).toBe('failed');
    expect(result.lines).toEqual([]);
    expect(formatAmount(result.unsoldSupply)).toBe('1000');
  });

  it('succeeds exactly at the soft cap — the cap is a floor, not a threshold to beat', () => {
    expect(allocate(presale({ softCap: amt('300') }), [{ userId: A, amount: amt('300') }]).outcome).toBe('succeeded');
  });
});

describe('allocate — presale', () => {
  it('sells at the published price and returns the unsold remainder', () => {
    const result = allocate(presale(), [
      { userId: A, amount: amt('200') }, // 100 tokens
      { userId: B, amount: amt('400') }, // 200 tokens
    ]);

    expect(result.outcome).toBe('succeeded');
    expect(result.lines.map((l) => formatAmount(l.saleAmount))).toEqual(['100', '200']);
    expect(result.lines.every((l) => l.refund === 0n)).toBe(true);
    expect(formatAmount(result.unsoldSupply)).toBe('700');
  });

  /**
   * Oversubscription splits pro-rata rather than first-come. A queue would
   * reward whoever had the fastest connection at the open; this rewards nobody.
   */
  it('scales down pro-rata when oversubscribed, and refunds what bought nothing', () => {
    const result = allocate(presale({ saleSupply: amt('300') }), [
      { userId: A, amount: amt('200') }, // wants 100
      { userId: B, amount: amt('400') }, // wants 200
      { userId: C, amount: amt('600') }, // wants 300
    ]);

    // 1200 committed against 300 tokens: each gets a sixth of their contribution
    // in tokens (300 * amount / 1200).
    expect(result.lines.map((l) => formatAmount(l.saleAmount))).toEqual(['50', '100', '150']);
    expect(result.lines.map((l) => formatAmount(l.refund))).toEqual(['100', '200', '300']);
    expect(formatAmount(result.unsoldSupply)).toBe('0');
  });

  it('never sells more than the supply, whatever the rounding does', () => {
    const result = allocate(presale({ saleSupply: amt('7'), price: amt('3') }), [
      { userId: A, amount: amt('10') },
      { userId: B, amount: amt('10') },
      { userId: C, amount: amt('11') },
    ]);

    const sold = sum(result.lines.map((l) => l.saleAmount));
    expect(sold).toBeLessThanOrEqual(amt('7'));
    expect(sold + result.unsoldSupply).toBe(amt('7'));
  });

  /**
   * THE ONE THAT PROTECTS THE CONTRIBUTOR.
   *
   * Whatever the price and whatever the rounding, nobody is ever charged more
   * than they committed — `contributed − refund` is what they spend, and it can
   * only ever be less than or equal to what they put in.
   */
  it('never charges a contributor more than they committed', () => {
    const result = allocate(presale({ saleSupply: amt('999'), price: amt('0.000000000000000003') }), [
      { userId: A, amount: amt('0.000000000000000007') },
      { userId: B, amount: amt('1.000000000000000001') },
    ]);

    for (const line of result.lines) {
      expect(line.refund).toBeGreaterThanOrEqual(0n);
      expect(line.refund).toBeLessThanOrEqual(line.contributed);
    }
  });

  it('refuses a presale with no price', () => {
    expect(() => allocate(presale({ price: null }), [{ userId: A, amount: amt('200') }])).toThrow(AllocationError);
  });
});

describe('allocate — fair launch', () => {
  it('sells the whole supply pro-rata, with no refunds and no oversubscription', () => {
    const result = allocate(fair(), [
      { userId: A, amount: amt('250') },
      { userId: B, amount: amt('750') },
    ]);

    expect(result.lines.map((l) => formatAmount(l.saleAmount))).toEqual(['250', '750']);
    expect(result.lines.every((l) => l.refund === 0n)).toBe(true);
    expect(formatAmount(result.unsoldSupply)).toBe('0');
  });

  /**
   * `proRata` hands the dust out one unit at a time, so the shares sum to
   * EXACTLY the supply. A raise that allocated 999.999… of 1000 would leave a
   * remainder stranded in escrow that no recipe could ever release.
   */
  it('distributes indivisible dust so the shares sum to exactly the supply', () => {
    const result = allocate(fair({ saleSupply: amt('10'), softCap: amt('3') }), [
      { userId: A, amount: amt('1') },
      { userId: B, amount: amt('1') },
      { userId: C, amount: amt('1') },
    ]);

    expect(sum(result.lines.map((l) => l.saleAmount))).toBe(amt('10'));
    expect(result.unsoldSupply).toBe(0n);
  });
});

describe('allocate — refusals', () => {
  it('refuses a raise with no supply', () => {
    expect(() => allocate(fair({ saleSupply: 0n }), [{ userId: A, amount: amt('1') }])).toThrow(AllocationError);
  });

  it('refuses a non-positive contribution', () => {
    expect(() => allocate(fair(), [{ userId: A, amount: 0n }])).toThrow(AllocationError);
  });
});

describe('commitHeadroom', () => {
  it('is bounded by whichever of the raise and the tier runs out first', () => {
    // Tier is the binding constraint.
    expect(
      formatAmount(commitHeadroom({ raised: amt('100'), hardCap: amt('1000'), alreadyCommitted: amt('40'), tierCap: amt('50') })),
    ).toBe('10');

    // The raise is the binding constraint.
    expect(
      formatAmount(commitHeadroom({ raised: amt('995'), hardCap: amt('1000'), alreadyCommitted: amt('0'), tierCap: amt('50') })),
    ).toBe('5');
  });

  it('never goes negative once a cap is already met or exceeded', () => {
    expect(commitHeadroom({ raised: amt('1000'), hardCap: amt('1000'), alreadyCommitted: 0n, tierCap: amt('50') })).toBe(0n);
    expect(commitHeadroom({ raised: 0n, hardCap: amt('1000'), alreadyCommitted: amt('60'), tierCap: amt('50') })).toBe(0n);
  });
});

describe('tierFor', () => {
  const tiers = [
    { name: 'open', minStake: 0n, allocationCap: amt('100') },
    { name: 'staked', minStake: amt('1000'), allocationCap: amt('500') },
    { name: 'core', minStake: amt('10000'), allocationCap: amt('5000') },
  ];

  it('gives the HIGHEST tier a stake clears, not the first one listed', () => {
    expect(tierFor(tiers, amt('50000'))?.name).toBe('core');
    expect(tierFor(tiers, amt('1000'))?.name).toBe('staked');
    expect(tierFor(tiers, amt('999'))?.name).toBe('open');
  });

  it('returns null when a raise has no gate the caller clears', () => {
    expect(tierFor([{ name: 'core', minStake: amt('10000'), allocationCap: amt('1') }], amt('9999'))).toBeNull();
    expect(tierFor([], amt('1'))).toBeNull();
  });
});
