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
 *   · silent allow when a configured rule is missing its required signal
 *   · silent allow when an enabled scoring rule has an unpublished threshold
 *   · silent auto-decline with no reason
 *
 * Pure function of inputs. No DB, no balances, no ledger post. Money never
 * moves here. Amounts still compare as scaled bigint via
 * `@intafaced/ledger-client` money helpers — never a JS `number`.
 */

import { parseAmount, type Amount } from '@intafaced/ledger-client';

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
   * Integer times over baseline that triggers amount_anomaly.
   * e.g. 5 → amount > 5× baseline. Must be a safe integer > 1 when set.
   * This is a count, not money — amounts stay bigint.
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
  /** Merchant typical amount as decimal string; absent → amount_anomaly reviews (signal unpublished). */
  readonly baselineAmount?: string | null;
  readonly thresholds?: FraudThresholds;
  readonly blocklists?: FraudBlocklists;
  /**
   * Per-rule enable map. Missing key = enabled.
   * Explicit `false` = kill-switched off.
   */
  readonly enabled?: FraudRuleSwitches;
  /**
   * Named origin of an external score (PSP / adapter). Omitted = rule-only path.
   * Present-but-blank (null / whitespace) fail-closes — never invent a score.
   */
  readonly scoreSource?: string | null;
}

export const FRAUD_THRESHOLD_UNPUBLISHED = 'pay.fraud_threshold_unpublished' as const;

export type FraudScoreErrorCode = 'pay.fraud_score_source_blank' | 'pay.fraud_score_invented';

/** Thrown when a score source is blank or an inventable rate/magnitude is supplied. */
export class FraudScoreError extends Error {
  constructor(
    message: string,
    readonly code: FraudScoreErrorCode,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'FraudScoreError';
  }
}

/**
 * Inventable score fields — never defaulted, never synthesised.
 * Approval/decline rates and chargeback magnitudes are caller/PSP facts or absent.
 */
export const FORBIDDEN_FRAUD_SCORE_FIELDS = ['approvalRate', 'declineRate', 'chargebackMagnitude', 'chargebackRate'] as const;

export function assertNoInventedFraudScores(bag: object): void {
  const rec = bag as Record<string, unknown>;
  for (const key of FORBIDDEN_FRAUD_SCORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rec, key) && rec[key] !== undefined) {
      throw new FraudScoreError(`pay.fraud forbids invented field ${key}`, 'pay.fraud_score_invented', key);
    }
  }
}

function scoreSourcePresent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Fail-closed when a score source key is present but blank.
 * Omitted key = rule-only evaluation (no model invented).
 */
export function assertFraudScoreSourceNotBlank(input: FraudEvaluationInput): void {
  if (!Object.prototype.hasOwnProperty.call(input, 'scoreSource')) return;
  if (scoreSourcePresent(input.scoreSource)) return;
  throw new FraudScoreError(
    'pay.fraud score source is blank — refuse rather than invent a score',
    'pay.fraud_score_source_blank',
    'scoreSource',
  );
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
function parseMoney(value: string | null | undefined): Amount | null {
  if (value === null || value === undefined) return null;
  const t = value.trim();
  if (!t) return null;
  try {
    const n = parseAmount(t);
    return n < 0n ? null : n;
  } catch {
    return null;
  }
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
  assertNoInventedFraudScores(input);
  assertFraudScoreSourceNotBlank(input);

  const reasons: FraudReason[] = [];
  const skippedDisabled: FraudRuleId[] = [];
  let outcome: FraudOutcome = 'allow';
  const th = input.thresholds ?? {};
  const enabled = input.enabled;

  const flag = (ruleId: FraudRuleId, detail: string, action: 'review' | 'decline'): void => {
    reasons.push({ ruleId, detail });
    outcome = worse(outcome, action);
  };

  const consider = (ruleId: FraudRuleId, run: () => void): void => {
    if (!isRuleEnabled(enabled, ruleId)) {
      skippedDisabled.push(ruleId);
      return;
    }
    run();
  };

  consider('blocklist_ip', () => {
    const ip = input.ip?.trim();
    const ips = toSet(input.blocklists?.ips);
    if (!ip) {
      if (ips.size > 0) flag('blocklist_ip', 'IP risk signal is unavailable', 'review');
      return;
    }
    if (ips.has(ip)) {
      flag('blocklist_ip', 'IP matched the merchant/ops blocklist', 'decline');
    }
  });

  consider('blocklist_device', () => {
    const deviceId = input.deviceId?.trim();
    const devices = toSet(input.blocklists?.devices);
    if (!deviceId) {
      if (devices.size > 0) flag('blocklist_device', 'device risk signal is unavailable', 'review');
      return;
    }
    if (devices.has(deviceId)) {
      flag('blocklist_device', 'device matched the merchant/ops blocklist', 'decline');
    }
  });

  consider('velocity_count', () => {
    const max = th.maxPaymentsInWindow;
    if (max === undefined || !Number.isSafeInteger(max) || max < 0) {
      flag('velocity_count', `${FRAUD_THRESHOLD_UNPUBLISHED}: maxPaymentsInWindow`, 'review');
      return;
    }
    const count = input.recentPaymentCount;
    if (count === undefined || !Number.isSafeInteger(count) || count < 0) {
      flag('velocity_count', 'recent payment count signal is unavailable', 'review');
      return;
    }
    if (count > max) {
      const action = th.velocityCountAction ?? 'review';
      flag('velocity_count', `recentPaymentCount ${count} exceeds maxPaymentsInWindow ${max}`, action);
    }
  });

  consider('velocity_volume', () => {
    const maxVol = parseMoney(th.maxVolumeInWindow);
    if (maxVol === null) {
      flag('velocity_volume', `${FRAUD_THRESHOLD_UNPUBLISHED}: maxVolumeInWindow`, 'review');
      return;
    }
    const recent = parseMoney(input.recentVolume);
    if (recent === null) {
      flag('velocity_volume', 'recent volume signal is unavailable', 'review');
      return;
    }
    if (recent > maxVol) {
      const action = th.velocityVolumeAction ?? 'review';
      flag('velocity_volume', `recentVolume ${input.recentVolume} exceeds maxVolumeInWindow ${th.maxVolumeInWindow}`, action);
    }
  });

  consider('amount_anomaly', () => {
    const mult = th.amountAnomalyMultiplier;
    if (mult === undefined || !Number.isSafeInteger(mult) || mult <= 1) {
      flag('amount_anomaly', `${FRAUD_THRESHOLD_UNPUBLISHED}: amountAnomalyMultiplier`, 'review');
      return;
    }
    const baseline = parseMoney(input.baselineAmount);
    if (baseline === null || baseline === 0n) {
      flag('amount_anomaly', 'merchant amount baseline signal is unavailable', 'review');
      return;
    }
    const amount = parseMoney(input.amount);
    if (amount === null) {
      flag('amount_anomaly', 'payment amount signal is unavailable', 'review');
      return;
    }
    if (amount > baseline * BigInt(mult)) {
      const action = th.amountAnomalyAction ?? 'review';
      flag('amount_anomaly', `amount exceeds ${mult}× merchant baseline`, action);
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
