/**
 * pay.fraud — risk scoring **mechanism** (SPEC-PAY-VERTICALS §3).
 *
 * Buildable now:
 *   · velocity rules (count + volume windows supplied by caller)
 *   · amount anomaly vs merchant baseline (caller supplies baseline)
 *   · blocklists (caller supplies content — content itself is Class X / counsel)
 *   · per-rule kill-switch
 *   · explainable decisions (every decline/review carries rule ids + detail)
 *
 * Explicitly NOT this module:
 *   · chargeback ledger wire (recipes exist; Nitro Class M/X sign-off — park)
 *   · sanctions screening (separate knobs — never shared with fraud)
 *   · inventing risk scores, approval rates, or protected-characteristic signals
 *   · silent auto-decline with no reason
 *
 * Pure function of inputs. No DB, no balances, no ledger. Money never moves here.
 */

export type FraudRuleId = 'velocity_count' | 'velocity_volume' | 'amount_anomaly' | 'blocklist_ip' | 'blocklist_device';

export type FraudOutcome = 'allow' | 'review' | 'decline';

export interface FraudReason {
  readonly ruleId: FraudRuleId;
  readonly detail: string;
}

export interface FraudDecision {
  readonly outcome: FraudOutcome;
  /** Always non-empty when outcome is decline or review. */
  readonly reasons: readonly FraudReason[];
  /** Rules that were configured but kill-switched off for this evaluation. */
  readonly skippedDisabled: readonly FraudRuleId[];
}

/** Kill-switch board: disabled rules do not fire (SPEC §3 per-rule kill-switch). */
export type FraudRuleSwitches = Readonly<Partial<Record<FraudRuleId, boolean>>>;

/**
 * Caller-owned lists. Empty default = no blocklist hits.
 * Filling production lists with real IPs/devices is Class X / ops — not invented here.
 */
export interface FraudBlocklists {
  readonly ips?: ReadonlySet<string> | readonly string[];
  readonly devices?: ReadonlySet<string> | readonly string[];
}

export interface FraudThresholds {
  /** Max payments in the velocity window before review/decline. */
  readonly maxPaymentsInWindow?: number;
  /** Max gross volume (decimal string) in the velocity window. */
  readonly maxVolumeInWindow?: string;
  /**
   * Multiplier over baseline amount that triggers amount_anomaly.
   * e.g. 5 → amount > 5× baseline. Must be a finite number > 1 when set.
   */
  readonly amountAnomalyMultiplier?: number;
  /** When velocity_count is exceeded: 'review' (default) or 'decline'. */
  readonly velocityCountAction?: 'review' | 'decline';
  /** When velocity_volume is exceeded. */
  readonly velocityVolumeAction?: 'review' | 'decline';
  /** When amount anomaly fires. */
  readonly amountAnomalyAction?: 'review' | 'decline';
}

export interface FraudEvaluationInput {
  readonly merchantId: string;
  /** Decimal string — money is never a JS number on this path. */
  readonly amount: string;
  readonly assetId: string;
  readonly ip?: string | null;
  readonly deviceId?: string | null;
  /** Payments already counted in the window (caller-owned meter). */
  readonly recentPaymentCount?: number;
  /** Gross volume in window as decimal string (caller-owned meter). */
  readonly recentVolume?: string;
  /** Merchant typical amount as decimal string; absent → amount_anomaly skipped. */
  readonly baselineAmount?: string | null;
  readonly thresholds?: FraudThresholds;
  readonly blocklists?: FraudBlocklists;
  /**
   * Per-rule enable map. Missing key = enabled.
   * Explicit `false` = kill-switched off.
   */
  readonly enabled?: FraudRuleSwitches;
}

function isRuleEnabled(enabled: FraudRuleSwitches | undefined, ruleId: FraudRuleId): boolean {
  if (!enabled) return true;
  return enabled[ruleId] !== false;
}

function toSet(list: ReadonlySet<string> | readonly string[] | undefined): Set<string> {
  if (!list) return new Set();
  if (list instanceof Set) return list;
  return new Set(list);
}

/** Parse a non-negative decimal string; null if unusable (refuse invent). */
function parseDecimal(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const OUTCOME_RANK: Record<FraudOutcome, number> = { allow: 0, review: 1, decline: 2 };

function worse(a: FraudOutcome, b: FraudOutcome): FraudOutcome {
  return OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b;
}

/**
 * Evaluate fraud rules. Never returns decline/review without reasons.
 * Never invents blocklist content, baselines, or velocity meters.
 */
export function evaluateFraud(input: FraudEvaluationInput): FraudDecision {
  const reasons: FraudReason[] = [];
  const skippedDisabled: FraudRuleId[] = [];
  let outcome: FraudOutcome = 'allow';
  const th = input.thresholds ?? {};
  const enabled = input.enabled;

  const consider = (ruleId: FraudRuleId, run: () => void): void => {
    if (!isRuleEnabled(enabled, ruleId)) {
      skippedDisabled.push(ruleId);
      return;
    }
    run();
  };

  consider('blocklist_ip', () => {
    const ip = input.ip?.trim();
    if (!ip) return;
    if (toSet(input.blocklists?.ips).has(ip)) {
      reasons.push({ ruleId: 'blocklist_ip', detail: `ip ${ip} is on the merchant/ops blocklist` });
      outcome = worse(outcome, 'decline');
    }
  });

  consider('blocklist_device', () => {
    const deviceId = input.deviceId?.trim();
    if (!deviceId) return;
    if (toSet(input.blocklists?.devices).has(deviceId)) {
      reasons.push({
        ruleId: 'blocklist_device',
        detail: `device ${deviceId} is on the merchant/ops blocklist`,
      });
      outcome = worse(outcome, 'decline');
    }
  });

  consider('velocity_count', () => {
    const max = th.maxPaymentsInWindow;
    if (max === undefined || max < 0) return;
    const count = input.recentPaymentCount;
    if (count === undefined) return; // no meter → do not invent a count
    if (count > max) {
      const action = th.velocityCountAction ?? 'review';
      reasons.push({
        ruleId: 'velocity_count',
        detail: `recentPaymentCount ${count} exceeds maxPaymentsInWindow ${max}`,
      });
      outcome = worse(outcome, action);
    }
  });

  consider('velocity_volume', () => {
    const maxVol = parseDecimal(th.maxVolumeInWindow);
    if (maxVol === null) return;
    const recent = parseDecimal(input.recentVolume);
    if (recent === null) return; // no meter → do not invent volume
    if (recent > maxVol) {
      const action = th.velocityVolumeAction ?? 'review';
      reasons.push({
        ruleId: 'velocity_volume',
        detail: `recentVolume ${input.recentVolume} exceeds maxVolumeInWindow ${th.maxVolumeInWindow}`,
      });
      outcome = worse(outcome, action);
    }
  });

  consider('amount_anomaly', () => {
    const mult = th.amountAnomalyMultiplier;
    if (mult === undefined || !(mult > 1) || !Number.isFinite(mult)) return;
    const baseline = parseDecimal(input.baselineAmount);
    if (baseline === null || baseline === 0) return; // no baseline → skip, never invent
    const amount = parseDecimal(input.amount);
    if (amount === null) return;
    if (amount > baseline * mult) {
      const action = th.amountAnomalyAction ?? 'review';
      reasons.push({
        ruleId: 'amount_anomaly',
        detail: `amount ${input.amount} exceeds ${mult}× baseline ${input.baselineAmount}`,
      });
      outcome = worse(outcome, action);
    }
  });

  if (outcome !== 'allow' && reasons.length === 0) {
    // Invariant: never silent decline/review (SPEC §3 hard rule).
    throw new Error('pay.fraud invariant: non-allow decision without reasons');
  }

  return { outcome, reasons, skippedDisabled };
}

/** True when a decision is allowed to auto-act without a human review queue. */
export function isAutoDecline(decision: FraudDecision): boolean {
  return decision.outcome === 'decline' && decision.reasons.length > 0;
}
