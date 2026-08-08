import { describe, expect, it } from 'vitest';
import {
  canTransition,
  checkEligibility,
  DEFAULT_ELIGIBILITY,
  isActiveMerchant,
  TRANSITIONS,
  type MerchantStatus,
} from './merchant-programme.js';
import { snapshotOf, type ReputationCounters } from './reputation.js';

/**
 * THE BADGE IS A CLAIM MADE TO A STRANGER.
 *
 * Someone is about to send money to a person they have never met, partly
 * because we vouched for them. So the assertions that matter here are the
 * refusals — a badge that can be obtained by a fresh account is worse than no
 * badge at all, because it converts our credibility into their cover.
 *
 * `TRK-p2p.merchants.md` Stage 1, DoD line 2: limits and badges derive from
 * "reputation + explicit programme rules, not a fresh account borrowing
 * merchant trust".
 */

function counters(over: Partial<ReputationCounters> = {}): ReputationCounters {
  return {
    tradesTotal: 20,
    completed: 20,
    cancelled: 0,
    disputed: 0,
    disputesLost: 0,
    totalReleaseSecs: 200,
    releaseSamples: 20,
    ...over,
  };
}

describe('eligibility — a fresh account cannot borrow merchant trust', () => {
  it('REFUSES an account with no trading history at all', () => {
    const verdict = checkEligibility(snapshotOf(counters({ tradesTotal: 0, completed: 0, releaseSamples: 0, totalReleaseSecs: 0 })));

    expect(verdict.eligible).toBe(false);
    // The refusal is a sentence, not a boolean: an applicant told "not
    // eligible" applies again next week; one told what is missing does not.
    expect(verdict.eligible === false && verdict.reason).toContain('10');
  });

  it('REFUSES an account one trade short, and says how many remain', () => {
    const verdict = checkEligibility(snapshotOf(counters({ tradesTotal: 9, completed: 9, releaseSamples: 9 })));

    expect(verdict.eligible).toBe(false);
    expect(verdict.eligible === false && verdict.reason).toContain('1 more to go');
  });

  it('REFUSES a busy account with a poor completion rate', () => {
    // Volume is not trust. 80 of 100 completed is a lot of strangers left waiting.
    const verdict = checkEligibility(snapshotOf(counters({ tradesTotal: 100, completed: 80, cancelled: 20, releaseSamples: 80 })));

    expect(verdict.eligible).toBe(false);
    expect(verdict.eligible === false && verdict.reason).toContain('%');
  });

  it('REFUSES an otherwise perfect account that has LOST a dispute', () => {
    // A lost dispute is the one signal that somebody was actually harmed.
    const verdict = checkEligibility(snapshotOf(counters({ disputed: 1, disputesLost: 1 })));

    expect(verdict.eligible).toBe(false);
    expect(verdict.eligible === false && verdict.reason).toContain('dispute');
  });

  it('accepts a long clean record', () => {
    expect(checkEligibility(snapshotOf(counters())).eligible).toBe(true);
  });

  it('reads its thresholds from policy, so product law is a config change', () => {
    // The tier ladder and numbers are open questions in the spec (§5). A caller
    // supplying real numbers must not need this file rewritten.
    const lenient = { minTradesTotal: 1, minCompletionRate: 0.5, maxDisputesLost: 5 };
    const thin = snapshotOf(counters({ tradesTotal: 2, completed: 1, cancelled: 1, releaseSamples: 1 }));

    expect(checkEligibility(thin).eligible).toBe(false);
    expect(checkEligibility(thin, lenient).eligible).toBe(true);
  });

  it('has a conservative default, because the failure directions are not symmetric', () => {
    expect(DEFAULT_ELIGIBILITY.minTradesTotal).toBeGreaterThan(0);
    expect(DEFAULT_ELIGIBILITY.minCompletionRate).toBeGreaterThan(0.9);
    expect(DEFAULT_ELIGIBILITY.maxDisputesLost).toBe(0);
  });
});

describe('the state machine', () => {
  it('lets an operator approve or reject an application', () => {
    expect(canTransition('applied', 'approved', 'operator').allowed).toBe(true);
    expect(canTransition('applied', 'rejected', 'operator').allowed).toBe(true);
  });

  it('REFUSES a merchant approving themselves', () => {
    // The edge is legal; the actor is not. A machine that validated only the
    // edge would let an applicant grant themselves the badge.
    const verdict = canTransition('applied', 'approved', 'self');

    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain('operator');
  });

  it('REFUSES a suspended merchant reinstating themselves', () => {
    expect(canTransition('suspended', 'approved', 'operator').allowed).toBe(true);
    expect(canTransition('suspended', 'approved', 'self').allowed).toBe(false);
  });

  it('lets an applicant withdraw at any live stage, but not resurrect', () => {
    expect(canTransition('applied', 'withdrawn', 'self').allowed).toBe(true);
    expect(canTransition('approved', 'withdrawn', 'self').allowed).toBe(true);
    expect(canTransition('suspended', 'withdrawn', 'self').allowed).toBe(true);
    expect(canTransition('withdrawn', 'approved', 'operator').allowed).toBe(false);
  });

  it('treats rejected and withdrawn as final, and says re-entry is a new application', () => {
    for (const terminal of ['rejected', 'withdrawn'] as const) {
      const verdict = canTransition(terminal, 'approved', 'operator');
      expect(verdict.allowed).toBe(false);
      expect(verdict.allowed === false && verdict.reason).toContain('new application');
    }
  });

  it('names the legal next states when refusing, so a caller can act', () => {
    const verdict = canTransition('approved', 'applied', 'operator');

    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain('suspended');
  });

  it('has no self-loops — a transition to the same state is never legal', () => {
    // A no-op transition would write a history row saying nothing changed,
    // which is how an append-only log stops being readable.
    for (const status of Object.keys(TRANSITIONS) as MerchantStatus[]) {
      expect(TRANSITIONS[status].some((t) => t.to === status)).toBe(false);
    }
  });

  it('counts only `approved` as an active merchant', () => {
    expect(isActiveMerchant('approved')).toBe(true);
    for (const other of ['applied', 'rejected', 'suspended', 'withdrawn'] as const) {
      expect(isActiveMerchant(other)).toBe(false);
    }
  });
});
