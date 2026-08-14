import type { ReputationSnapshot } from './reputation.js';

/**
 * THE P2P MERCHANT PROGRAMME — membership rules, pure and without I/O.
 *
 * `TRK-p2p.merchants.md` Stage 1. This file is the state machine and the
 * eligibility rule; `p2p-service` does the writing and the history.
 *
 * ── THE ONE RULE THE SPEC LEADS WITH ─────────────────────────────────────
 *
 * "Limits and badges derive from reputation + explicit programme rules, not a
 * fresh account borrowing merchant trust."
 *
 * A merchant badge is a claim made to a stranger who is about to send money to
 * somebody they have never met. If a day-old account can wear it, the badge is
 * worse than absent — it converts our credibility into their cover. So
 * eligibility is checked against EARNED reputation, and the numbers that
 * justified an approval are stored on the row rather than recomputed, because
 * reputation moves and a decision has to stay explicable afterwards.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DECIDE ──────────────────────────
 *
 * The tier ladder and the numeric limits are PRODUCT LAW and are open questions
 * in the spec (§5: "Badge tiers and numeric limits — product law?"). Inventing
 * them here would be exactly the "money/product invention" the pack forbids.
 *
 * So the thresholds are a POLICY OBJECT with a stated default, not constants
 * baked into the logic. When the owner sets real numbers it is a config change,
 * not a rewrite — and until then the default is deliberately conservative,
 * because the failure direction of "too strict" is a merchant who waits, and of
 * "too loose" is a stranger who is defrauded under our badge.
 */

export type MerchantStatus = 'applied' | 'approved' | 'rejected' | 'suspended' | 'withdrawn';

/**
 * Who may make each transition.
 *
 * `self` is the applicant acting on their own record; `operator` needs the
 * moderation scope. Both are recorded in the history — the actor is never taken
 * from a request body.
 */
export type TransitionActor = 'self' | 'operator';

export interface MerchantTransition {
  readonly to: MerchantStatus;
  readonly by: TransitionActor;
  readonly description: string;
}

/**
 * The legal moves, exhaustively.
 *
 * Written as data rather than as `if` chains so the whole machine is readable
 * in one screen and a missing edge is visible rather than buried. Every state
 * that is not listed as a source is terminal for that actor.
 */
export const TRANSITIONS: Readonly<Record<MerchantStatus, readonly MerchantTransition[]>> = Object.freeze({
  applied: [
    { to: 'approved', by: 'operator', description: 'Application accepted.' },
    { to: 'rejected', by: 'operator', description: 'Application refused.' },
    { to: 'withdrawn', by: 'self', description: 'Applicant withdrew before a decision.' },
  ],
  approved: [
    { to: 'suspended', by: 'operator', description: 'Standing revoked pending review.' },
    { to: 'withdrawn', by: 'self', description: 'Merchant left the programme.' },
  ],
  /**
   * Suspended is reversible ON PURPOSE. A suspension that could only end in
   * expulsion would make operators reluctant to use it, and the alternative to
   * a reversible suspension is not a careful decision — it is no suspension at
   * all while somebody investigates.
   */
  suspended: [
    { to: 'approved', by: 'operator', description: 'Reinstated after review.' },
    { to: 'rejected', by: 'operator', description: 'Removed from the programme.' },
    { to: 'withdrawn', by: 'self', description: 'Merchant left while suspended.' },
  ],
  /**
   * Terminal. Re-entry is a NEW application — which re-runs eligibility against
   * current reputation rather than restoring a standing that was already taken
   * away, and leaves both attempts in the history.
   */
  rejected: [],
  withdrawn: [],
});

export interface EligibilityPolicy {
  /** Trades that reached escrow. A count nobody can fake by starting takes. */
  readonly minTradesTotal: number;
  /** `completed / tradesTotal`, 0..1. */
  readonly minCompletionRate: number;
  /** Disputes lost. Above this, an application is refused outright. */
  readonly maxDisputesLost: number;
}

/**
 * Conservative until somebody with the authority says otherwise.
 *
 * Ten escrowed trades and a 95% completion rate is not a considered product
 * position — it is a placeholder chosen so that the honest failure is a
 * merchant who has to wait, rather than a stranger who loses money to a badge
 * we granted on no evidence. §5 of the spec is where the real numbers come from.
 */
export const DEFAULT_ELIGIBILITY: EligibilityPolicy = Object.freeze({
  minTradesTotal: 10,
  minCompletionRate: 0.95,
  maxDisputesLost: 0,
});

export type EligibilityVerdict = { readonly eligible: true } | { readonly eligible: false; readonly reason: string };

/**
 * May this reputation apply?
 *
 * Returns a SENTENCE on refusal, not a boolean. An applicant who is told "not
 * eligible" learns nothing and applies again next week; one who is told they
 * need four more completed trades knows exactly what to do, and stops asking
 * support.
 */
export function checkEligibility(snapshot: ReputationSnapshot, policy: EligibilityPolicy = DEFAULT_ELIGIBILITY): EligibilityVerdict {
  if (snapshot.tradesTotal < policy.minTradesTotal) {
    const short = policy.minTradesTotal - snapshot.tradesTotal;
    return {
      eligible: false,
      reason: `The programme needs ${policy.minTradesTotal} escrowed trades; this account has ${snapshot.tradesTotal}. ${short} more to go.`,
    };
  }
  if (snapshot.disputesLost > policy.maxDisputesLost) {
    return {
      eligible: false,
      reason: `The programme allows at most ${policy.maxDisputesLost} lost dispute(s); this account has ${snapshot.disputesLost}.`,
    };
  }
  if (snapshot.completionRate < policy.minCompletionRate) {
    const need = (policy.minCompletionRate * 100).toFixed(2);
    const have = (snapshot.completionRate * 100).toFixed(2);
    return { eligible: false, reason: `The programme needs a ${need}% completion rate; this account is at ${have}%.` };
  }
  return { eligible: true };
}

export type TransitionVerdict = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/**
 * Is this move legal, for this actor?
 *
 * Actor is checked as well as the edge. `suspended → approved` is a real
 * transition and a merchant reinstating themselves is not — a machine that
 * validated only the edge would let them.
 */
export function canTransition(from: MerchantStatus, to: MerchantStatus, by: TransitionActor): TransitionVerdict {
  const legal = TRANSITIONS[from];
  if (legal.length === 0) {
    return { allowed: false, reason: `A ${from} application is final. Re-entry is a new application.` };
  }
  const edge = legal.find((t) => t.to === to);
  if (!edge) {
    const options = legal.map((t) => t.to).join(', ');
    return { allowed: false, reason: `Cannot go from ${from} to ${to}. Legal next: ${options}.` };
  }
  if (edge.by !== by) {
    return { allowed: false, reason: `Only ${edge.by} may move a merchant from ${from} to ${to}.` };
  }
  return { allowed: true };
}

/** Statuses a caller should be treated as an active merchant in. */
export function isActiveMerchant(status: MerchantStatus): boolean {
  return status === 'approved';
}

/**
 * Programme vouch on a public reputation door — same snapshot badges use.
 *
 * `null` means the programme is not wired (not "this trader is not a merchant").
 * Frozen / applied / rejected / withdrawn never read `true`: freeze must be
 * visible on the same payload as derived badges, or counterparties keep treating
 * a suspended row as vouched-for.
 */
export function programmeVouch(status: MerchantStatus | null | undefined, programmeWired: boolean): boolean | null {
  if (!programmeWired) return null;
  return isActiveMerchant(status ?? 'withdrawn');
}

export interface ReputationPublicDoor {
  readonly tradesTotal: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly disputed: number;
  readonly disputesLost: number;
  readonly totalReleaseSecs: number;
  readonly releaseSamples: number;
  readonly completionRate: number;
  readonly avgReleaseSecs: number;
  readonly badges: string[];
  readonly merchant: boolean | null;
}

/** One payload: derived badges + programme freeze. Never a second scorecard. */
export function reputationOnPublicDoor(snapshot: ReputationSnapshot, merchant: boolean | null): ReputationPublicDoor {
  return {
    tradesTotal: snapshot.tradesTotal,
    completed: snapshot.completed,
    cancelled: snapshot.cancelled,
    disputed: snapshot.disputed,
    disputesLost: snapshot.disputesLost,
    totalReleaseSecs: snapshot.totalReleaseSecs,
    releaseSamples: snapshot.releaseSamples,
    completionRate: snapshot.completionRate,
    avgReleaseSecs: snapshot.avgReleaseSecs,
    badges: [...snapshot.badges],
    merchant,
  };
}

/** Audit line: freeze/restore is checkable against the counters badges use. */
export function describeReputationSnapshot(snapshot: ReputationSnapshot): string {
  const badges = snapshot.badges.length === 0 ? 'none' : snapshot.badges.join(',');
  return `${snapshot.tradesTotal} escrowed trades at ${(snapshot.completionRate * 100).toFixed(2)}% completion, derived badges: ${badges}`;
}

/**
 * Unfreeze is not a permanent grant. Restoring `suspended → approved` re-runs
 * the same eligibility rule apply uses; badges stay derived from counters.
 */
export function mayRestoreProgrammePrivileges(
  snapshot: ReputationSnapshot,
  policy: EligibilityPolicy = DEFAULT_ELIGIBILITY,
): EligibilityVerdict {
  return checkEligibility(snapshot, policy);
}

/**
 * After a moderated dispute loss, may this approved standing keep the badge?
 *
 * Application eligibility already refuses `disputesLost > maxDisputesLost`.
 * Leaving an approved row untouched after the same loss would let the badge
 * keep vouching for someone a human moderator has already ruled against —
 * the dispute-law half of D26-P1-I2. Non-approved rows are untouched here;
 * operator unfreeze still re-checks live eligibility (`mayRestoreProgrammePrivileges`)
 * so a human cannot stamp approved over a snapshot that would fail apply.
 */
export function standingBrokenByDisputeLaw(
  status: MerchantStatus,
  snapshot: ReputationSnapshot,
  policy: EligibilityPolicy = DEFAULT_ELIGIBILITY,
): { readonly broken: true; readonly reason: string } | { readonly broken: false } {
  if (status !== 'approved') return { broken: false };
  const verdict = checkEligibility(snapshot, policy);
  if (verdict.eligible) return { broken: false };
  return { broken: true, reason: verdict.reason };
}
