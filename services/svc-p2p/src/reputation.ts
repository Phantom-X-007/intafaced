/**
 * P2P REPUTATION (§6.2) — pure, no I/O.
 *
 *   "Reputation events feed the same XP graph — a spotless P2P record raises
 *    limits everywhere (rank perks table)."  §6.2 → §4.1
 *
 * So this file computes two things: the numbers a counterparty sees before
 * they trade with you, and the XP delta that goes to svc-identity as an
 * `intafaced.identity.xp.earned` event. svc-identity is the only writer to
 * `rank_state`; this service never touches it.
 */

export interface ReputationCounters {
  readonly tradesTotal: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly disputed: number;
  readonly disputesLost: number;
  readonly totalReleaseSecs: number;
  readonly releaseSamples: number;
}

export const EMPTY_COUNTERS: ReputationCounters = {
  tradesTotal: 0,
  completed: 0,
  cancelled: 0,
  disputed: 0,
  disputesLost: 0,
  totalReleaseSecs: 0,
  releaseSamples: 0,
};

export interface ReputationSnapshot extends ReputationCounters {
  /** completed / tradesTotal, 0..1, four decimal places. */
  readonly completionRate: number;
  readonly avgReleaseSecs: number;
  readonly badges: readonly string[];
}

/**
 * Completion rate, to four decimals.
 *
 * Denominator is every trade that reached escrow, not every trade started: a
 * take that never escrowed cost the counterparty nothing, and counting it would
 * let a flaky client destroy an honest merchant's rate.
 *
 * A user with no history is 0, not 1. An empty record is not a perfect record,
 * and rendering it as one is how a fresh account borrows a merchant's trust.
 */
export function completionRate(counters: ReputationCounters): number {
  if (counters.tradesTotal <= 0) return 0;
  return Math.round((counters.completed / counters.tradesTotal) * 10_000) / 10_000;
}

/**
 * Average seconds from escrow lock to release, over the trades where this user
 * was the seller. It is the number a buyer actually cares about: how long their
 * money is in limbo.
 */
export function avgReleaseSecs(counters: ReputationCounters): number {
  if (counters.releaseSamples <= 0) return 0;
  return Math.round(counters.totalReleaseSecs / counters.releaseSamples);
}

export interface BadgeRule {
  readonly id: string;
  readonly test: (snapshot: Omit<ReputationSnapshot, 'badges'>) => boolean;
  readonly description: string;
}

/**
 * Badges are derived, never stored as an independent fact — recomputed from the
 * counters on every update, so revoking one is automatic when the behaviour
 * that earned it stops. A badge that can only be granted is a badge that lies.
 */
export const BADGE_RULES: readonly BadgeRule[] = [
  {
    id: 'first-trade',
    test: (s) => s.completed >= 1,
    description: 'Completed a P2P trade',
  },
  {
    id: 'reliable',
    test: (s) => s.completed >= 10 && s.completionRate >= 0.95,
    description: '10+ trades at 95%+ completion',
  },
  {
    id: 'fast-release',
    test: (s) => s.releaseSamples >= 10 && s.avgReleaseSecs > 0 && s.avgReleaseSecs <= 300,
    description: 'Releases escrow in under 5 minutes on average',
  },
  {
    id: 'spotless',
    // §6.2's phrase, made checkable. This is the badge the rank perks table
    // keys a raised P2P limit off, so its bar is deliberately hard.
    test: (s) => s.completed >= 50 && s.completionRate >= 0.98 && s.disputesLost === 0,
    description: '50+ trades, 98%+ completion, no dispute ever lost',
  },
];

export function badgesFor(snapshot: Omit<ReputationSnapshot, 'badges'>): string[] {
  return BADGE_RULES.filter((r) => r.test(snapshot)).map((r) => r.id);
}

export function snapshotOf(counters: ReputationCounters): ReputationSnapshot {
  const base = {
    ...counters,
    completionRate: completionRate(counters),
    avgReleaseSecs: avgReleaseSecs(counters),
  };
  return { ...base, badges: badgesFor(base) };
}

// ── XP (§6.2 → §4.1) ─────────────────────────────────────────────────────────

/**
 * What a P2P outcome is worth in the one XP graph.
 *
 * `disputeLost` is negative because the graph is shared: a P2P record that can
 * only go up would let a bad-faith trader farm rank on completed trades and
 * spend it on higher limits in svc-trade and svc-bank. XP floors at zero in
 * svc-identity, so this cannot push anyone below the ladder — it can only stop
 * a bad record from being worth as much as a good one.
 */
export interface XpPolicy {
  readonly tradeCompletedSeller: number;
  readonly tradeCompletedBuyer: number;
  readonly disputeLost: number;
}

export const DEFAULT_XP_POLICY: XpPolicy = {
  // The seller carries the escrow risk and does the confirming, so the seller
  // earns slightly more for the same completed trade.
  tradeCompletedSeller: 30,
  tradeCompletedBuyer: 20,
  disputeLost: -100,
};

export type P2pXpAction = 'trade.completed.seller' | 'trade.completed.buyer' | 'dispute.lost';

export function xpFor(action: P2pXpAction, policy: XpPolicy = DEFAULT_XP_POLICY): number {
  switch (action) {
    case 'trade.completed.seller':
      return policy.tradeCompletedSeller;
    case 'trade.completed.buyer':
      return policy.tradeCompletedBuyer;
    case 'dispute.lost':
      return policy.disputeLost;
  }
}

/**
 * The XP idempotency key.
 *
 * §5: idempotency keys are business keys. A replayed release event must find
 * the original award, not mint a second one — svc-identity dedupes on exactly
 * this string (`identity.xp_events.idempotency_key`).
 */
export function xpKey(tradeId: string, userId: string, action: P2pXpAction): string {
  return `p2p:${action}:${tradeId}:${userId}`;
}

// ── Counter transitions ──────────────────────────────────────────────────────

export type TradeOutcome = 'escrowed' | 'completed' | 'cancelled' | 'disputed' | 'dispute_lost';

/**
 * Apply one outcome to a user's counters.
 *
 * Pure and total, so the ordering of a mixed run (escrowed → disputed →
 * completed) is testable without a database, and so the invariant "completed +
 * cancelled ≤ tradesTotal" — which the migration also enforces — is provable
 * rather than hoped for.
 */
export function applyOutcome(counters: ReputationCounters, outcome: TradeOutcome, releaseSecs?: number): ReputationCounters {
  switch (outcome) {
    case 'escrowed':
      // Counted at escrow, not at take: a take that never locked cost the
      // counterparty nothing and must not dilute anyone's rate.
      return { ...counters, tradesTotal: counters.tradesTotal + 1 };

    case 'completed': {
      const sample = releaseSecs !== undefined && releaseSecs >= 0;
      return {
        ...counters,
        completed: counters.completed + 1,
        totalReleaseSecs: sample ? counters.totalReleaseSecs + Math.round(releaseSecs) : counters.totalReleaseSecs,
        releaseSamples: sample ? counters.releaseSamples + 1 : counters.releaseSamples,
      };
    }

    case 'cancelled':
      return { ...counters, cancelled: counters.cancelled + 1 };

    case 'disputed':
      return { ...counters, disputed: counters.disputed + 1 };

    case 'dispute_lost':
      return { ...counters, disputesLost: counters.disputesLost + 1 };
  }
}
