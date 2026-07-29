import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { claimable, scheduleWindow, vestedAt, VestingError, type VestingTerms } from './vesting.js';

/**
 * VESTING — the curve a beneficiary is shown and the curve a claim pays must be
 * the same curve. These are the tests that make that true.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

/** 1200 tokens, 90-day cliff, 360-day linear vest. */
const terms: VestingTerms = {
  total: amt('1200'),
  startAt: T0,
  cliffAt: at(90),
  endAt: at(360),
};

describe('vestedAt', () => {
  it('releases nothing at all before the cliff, however much has accrued', () => {
    expect(vestedAt(terms, T0)).toBe(0n);
    expect(vestedAt(terms, at(89))).toBe(0n);
    expect(vestedAt(terms, at(89.999))).toBe(0n);
  });

  /**
   * A cliff is not a late start. Everything that accrued from `startAt` becomes
   * claimable in one step the instant the cliff passes — 90/360 of the grant.
   */
  it('releases everything accrued since the start in one step at the cliff', () => {
    expect(formatAmount(vestedAt(terms, at(90)))).toBe('300');
  });

  it('accrues linearly after the cliff', () => {
    expect(formatAmount(vestedAt(terms, at(180)))).toBe('600');
    expect(formatAmount(vestedAt(terms, at(270)))).toBe('900');
  });

  it('is exactly the total at the end, and never more afterwards', () => {
    expect(vestedAt(terms, at(360))).toBe(amt('1200'));
    expect(vestedAt(terms, at(10_000))).toBe(amt('1200'));
  });

  it('is monotonic — the curve never goes backwards', () => {
    let previous = 0n;
    for (let d = 0; d <= 400; d += 7) {
      const now = vestedAt(terms, at(d));
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });

  it('refuses terms that cannot describe a schedule', () => {
    expect(() => vestedAt({ ...terms, total: 0n }, at(180))).toThrow(VestingError);
    expect(() => vestedAt({ ...terms, endAt: T0 }, at(180))).toThrow(VestingError);
    expect(() => vestedAt({ ...terms, cliffAt: at(400) }, at(180))).toThrow(VestingError);
  });
});

describe('claimable', () => {
  it('pays the difference between the curve and what has already been released', () => {
    expect(formatAmount(claimable(terms, 0n, at(180)))).toBe('600');
    expect(formatAmount(claimable(terms, amt('300'), at(180)))).toBe('300');
    expect(claimable(terms, amt('600'), at(180))).toBe(0n);
  });

  it('never pays a negative amount when the watermark is ahead of the curve', () => {
    // Legitimate mid-schedule: a tranche paid moments ago is ahead of the
    // curve read microseconds later.
    expect(claimable(terms, amt('700'), at(180))).toBe(0n);
  });

  /**
   * THE ONE THAT CLOSES THE GRANT EXACTLY.
   *
   * Every division on the way rounds `floor`, so the curve can land a unit or
   * two short of the total. The last tranche is computed as `total − released`
   * instead, or a schedule would keep a permanently unclaimable remainder in
   * escrow — value nobody could ever move again.
   */
  it('pays out the whole grant by the end, dust included', () => {
    const awkward: VestingTerms = { total: amt('0.000000000000000007'), startAt: T0, cliffAt: T0, endAt: at(7) };

    let released = 0n;
    for (let d = 0; d <= 7; d++) {
      released += claimable(awkward, released, at(d));
    }
    expect(released).toBe(awkward.total);
  });

  /**
   * An over-released schedule means the row and the ledger disagree about what
   * has been paid. Returning "nothing claimable" would hide exactly the drift a
   * reconciliation exists to find, so it throws instead.
   */
  it('refuses a schedule that claims to have released more than it granted', () => {
    expect(() => claimable(terms, amt('1201'), at(360))).toThrow(VestingError);
    expect(() => claimable(terms, -1n, at(360))).toThrow(VestingError);
  });
});

describe('scheduleWindow', () => {
  it('measures the cliff and the duration from the same instant', () => {
    const w = scheduleWindow({ settledAt: T0, cliffDays: 90, durationDays: 360 });
    expect(w.startAt.toISOString()).toBe(T0.toISOString());
    expect(w.cliffAt.toISOString()).toBe(at(90).toISOString());
    expect(w.endAt.toISOString()).toBe(at(360).toISOString());
  });

  it('allows a zero cliff — that is a plain linear vest', () => {
    const w = scheduleWindow({ settledAt: T0, cliffDays: 0, durationDays: 30 });
    expect(w.cliffAt.getTime()).toBe(w.startAt.getTime());
    expect(vestedAt({ total: amt('30'), ...w }, at(10))).toBe(amt('10'));
  });

  it('refuses a cliff that falls after the schedule ends', () => {
    expect(() => scheduleWindow({ settledAt: T0, cliffDays: 400, durationDays: 360 })).toThrow(VestingError);
  });

  it('refuses fractional or non-positive terms', () => {
    expect(() => scheduleWindow({ settledAt: T0, cliffDays: 1.5, durationDays: 360 })).toThrow(VestingError);
    expect(() => scheduleWindow({ settledAt: T0, cliffDays: 0, durationDays: 0 })).toThrow(VestingError);
  });
});
