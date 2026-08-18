import { describe, expect, it } from 'vitest';
import {
  BADGE_RULES,
  DEFAULT_XP_POLICY,
  EMPTY_COUNTERS,
  applyOutcome,
  avgReleaseSecs,
  badgesFor,
  completionRate,
  snapshotOf,
  xpFor,
  xpKey,
  type ReputationCounters,
} from './reputation.js';

/** Pure, so tested exhaustively — including the counter invariants the
 *  migration also enforces, which is the point: the constraint and the code
 *  must agree, and both are checked here. */

const run = (outcomes: Array<[Parameters<typeof applyOutcome>[1], number?]>): ReputationCounters =>
  outcomes.reduce<ReputationCounters>((acc, [outcome, secs]) => applyOutcome(acc, outcome, secs), EMPTY_COUNTERS);

describe('completionRate', () => {
  it('is zero for a user with no history — not one', () => {
    // An empty record is not a perfect record. Rendering an unknown trader as
    // flawless is how a fresh account borrows a merchant's trust.
    expect(completionRate(EMPTY_COUNTERS)).toBe(0);
  });

  it('is 1 when every escrowed trade completed', () => {
    expect(completionRate(run([['escrowed'], ['completed'], ['escrowed'], ['completed']]))).toBe(1);
  });

  it('halves when half were cancelled', () => {
    expect(completionRate(run([['escrowed'], ['escrowed'], ['completed'], ['cancelled']]))).toBe(0.5);
  });

  it('rounds to four decimals', () => {
    const counters = run([...Array.from({ length: 3 }, () => ['escrowed'] as const), ['completed']]);
    expect(completionRate(counters)).toBe(0.3333);
  });

  it('counts a trade from escrow, not from take', () => {
    // A take that never locked cost the counterparty nothing, so it must not
    // dilute anyone's rate.
    const counters = run([['completed']]);
    expect(counters.tradesTotal).toBe(0);
    expect(completionRate(counters)).toBe(0);
  });
});

describe('avgReleaseSecs', () => {
  it('is zero with no samples', () => {
    expect(avgReleaseSecs(EMPTY_COUNTERS)).toBe(0);
  });

  it('averages the samples it has', () => {
    const counters = run([['escrowed'], ['completed', 100], ['escrowed'], ['completed', 200]]);
    expect(avgReleaseSecs(counters)).toBe(150);
  });

  it('accumulates exactly rather than averaging averages', () => {
    // Averaging averages drifts. Nine 10s releases plus one 1000s release must
    // read as 109, not as something near 500.
    let counters = EMPTY_COUNTERS;
    for (let i = 0; i < 9; i++) counters = applyOutcome(applyOutcome(counters, 'escrowed'), 'completed', 10);
    counters = applyOutcome(applyOutcome(counters, 'escrowed'), 'completed', 1000);
    expect(avgReleaseSecs(counters)).toBe(109);
  });

  it('ignores a missing sample rather than counting it as zero', () => {
    const counters = run([['escrowed'], ['completed', 300], ['escrowed'], ['completed']]);
    expect(counters.releaseSamples).toBe(1);
    expect(avgReleaseSecs(counters)).toBe(300);
  });
});

describe('badges', () => {
  const at = (overrides: Partial<ReputationCounters>) => snapshotOf({ ...EMPTY_COUNTERS, ...overrides });

  it('gives nothing to an empty record', () => {
    expect(at({}).badges).toEqual([]);
  });

  it('awards first-trade on the first completion', () => {
    expect(at({ tradesTotal: 1, completed: 1 }).badges).toContain('first-trade');
  });

  it('awards reliable at 10 trades and 95%', () => {
    expect(at({ tradesTotal: 20, completed: 19 }).badges).toContain('reliable');
    expect(at({ tradesTotal: 20, completed: 18 }).badges).not.toContain('reliable');
  });

  it('awards fast-release only with enough samples', () => {
    expect(at({ releaseSamples: 9, totalReleaseSecs: 900, completed: 9, tradesTotal: 9 }).badges).not.toContain('fast-release');
    expect(at({ releaseSamples: 10, totalReleaseSecs: 1000, completed: 10, tradesTotal: 10 }).badges).toContain('fast-release');
  });

  it('awards spotless only with no dispute ever lost', () => {
    const clean = at({ tradesTotal: 60, completed: 59 });
    expect(clean.badges).toContain('spotless');

    const stained = at({ tradesTotal: 60, completed: 59, disputed: 1, disputesLost: 1 });
    expect(stained.badges).not.toContain('spotless');
  });

  it('REVOKES a badge when the behaviour that earned it stops', () => {
    // Badges are derived on every update, never stored as an independent fact.
    // A badge that can only be granted is a badge that lies.
    let counters: ReputationCounters = { ...EMPTY_COUNTERS, tradesTotal: 60, completed: 59 };
    expect(badgesFor(snapshotOf(counters))).toContain('spotless');

    counters = applyOutcome(applyOutcome(counters, 'disputed'), 'dispute_lost');
    expect(badgesFor(snapshotOf(counters))).not.toContain('spotless');
  });

  it('has a description for every rule', () => {
    for (const rule of BADGE_RULES) {
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });
});

describe('XP into the one graph (§6.2 → §4.1)', () => {
  it('pays the seller more than the buyer for the same trade', () => {
    // The seller carries the escrow risk and does the confirming.
    expect(xpFor('trade.completed.seller')).toBeGreaterThan(xpFor('trade.completed.buyer'));
  });

  it('is negative for a lost dispute', () => {
    // A record that can only go up would let a bad-faith trader farm rank on
    // completed trades and spend it on limits in svc-trade and svc-bank.
    expect(xpFor('dispute.lost')).toBeLessThan(0);
  });

  it('costs more to lose a dispute than a completed trade earns', () => {
    expect(Math.abs(xpFor('dispute.lost'))).toBeGreaterThan(xpFor('trade.completed.seller'));
  });

  it('honours a supplied policy', () => {
    expect(xpFor('trade.completed.buyer', { ...DEFAULT_XP_POLICY, tradeCompletedBuyer: 7 })).toBe(7);
  });

  it('keys an award on the trade and the user — a business key, never a uuid', () => {
    const key = xpKey('trade-1', 'user-1', 'trade.completed.seller');
    expect(key).toBe('p2p:trade.completed.seller:trade-1:user-1');
    // A replay must produce the identical key so svc-identity finds the original.
    expect(xpKey('trade-1', 'user-1', 'trade.completed.seller')).toBe(key);
  });

  it('gives each party of one trade a distinct key', () => {
    expect(xpKey('t', 'seller', 'trade.completed.seller')).not.toBe(xpKey('t', 'buyer', 'trade.completed.buyer'));
  });

  it('does not invent a rank that unlocks money inside this package', () => {
    // XP is announced with business keys; rank_state and p2pLimitMultiplier live
    // in identity. Badges here are display only — a spotless badge must not
    // change a fee or a ceiling in this service.
    const hot = snapshotOf({ ...EMPTY_COUNTERS, tradesTotal: 100, completed: 100 });
    expect(hot.badges).toContain('spotless');
    // No fee / limit field on the snapshot — if one appears, this pin fails.
    expect(hot).not.toHaveProperty('feeBps');
    expect(hot).not.toHaveProperty('p2pLimitMultiplier');
    expect(hot).not.toHaveProperty('offerCeiling');
  });
});

describe('INVARIANT: counters can never contradict the database constraints', () => {
  it('keeps completed + cancelled ≤ tradesTotal across any sane ordering', () => {
    // `p2p_reputation_counters_conserved_ck` says the same thing in SQL.
    let counters = EMPTY_COUNTERS;
    for (let i = 0; i < 50; i++) {
      counters = applyOutcome(counters, 'escrowed');
      counters = applyOutcome(counters, i % 3 === 0 ? 'cancelled' : 'completed', 60);
      expect(counters.completed + counters.cancelled).toBeLessThanOrEqual(counters.tradesTotal);
    }
  });

  it('keeps disputesLost ≤ disputed', () => {
    let counters = EMPTY_COUNTERS;
    for (let i = 0; i < 10; i++) {
      counters = applyOutcome(counters, 'disputed');
      if (i % 2 === 0) counters = applyOutcome(counters, 'dispute_lost');
      expect(counters.disputesLost).toBeLessThanOrEqual(counters.disputed);
    }
  });

  it('keeps the completion rate inside 0..1 for every reachable state', () => {
    let counters = EMPTY_COUNTERS;
    for (let i = 0; i < 100; i++) {
      counters = applyOutcome(counters, 'escrowed');
      if (i % 4 !== 0) counters = applyOutcome(counters, 'completed', i);
      const rate = completionRate(counters);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  it('never produces a negative counter', () => {
    const counters = run([['escrowed'], ['disputed'], ['dispute_lost'], ['cancelled']]);
    for (const value of Object.values(counters)) expect(value).toBeGreaterThanOrEqual(0);
  });
});
