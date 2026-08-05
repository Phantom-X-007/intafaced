/**
 * Notify Stage-2 — delivery honesty helpers (TRK-ops.notifications).
 *
 * Pure law: accepted-for-delivery ≠ user-received / read.
 * Never log recipient addresses here (callers keep PII off logs).
 */

export type DeliveryOutcome = 'accepted' | 'refused' | 'failed';

export type DeliveryHonesty = {
  readonly outcome: DeliveryOutcome;
  /** Operator-facing code — not a user brand string. */
  readonly code: string;
  /**
   * True only when a transport accepted custody. Never true for refuse/fail.
   * Grace clocks (e.g. margin) must not start unless this is true.
   */
  readonly mayStartGraceClock: boolean;
  /** True only for in-app inbox land — out-of-app never claims "read". */
  readonly mayMarkUserVisibleInbox: boolean;
};

/**
 * Map adapter outcome → honesty flags. Secrets/recipients stay out of this pure layer.
 */
export function deliveryHonesty(input: {
  outcome: DeliveryOutcome;
  channel: 'inapp' | 'email' | 'push' | 'sms';
  code: string;
}): DeliveryHonesty {
  const code = input.code.trim() || 'unknown';
  if (input.outcome === 'accepted') {
    return {
      outcome: 'accepted',
      code,
      mayStartGraceClock: true,
      mayMarkUserVisibleInbox: input.channel === 'inapp',
    };
  }
  return {
    outcome: input.outcome,
    code,
    mayStartGraceClock: false,
    mayMarkUserVisibleInbox: false,
  };
}

/** Refuse silent success when credentials missing for required out-of-app channel. */
export function missingCredentialHonesty(channel: 'email' | 'push' | 'sms'): DeliveryHonesty {
  return deliveryHonesty({
    outcome: 'refused',
    channel,
    code: `notify.${channel}.credentials_missing`,
  });
}

export type ChannelDeliveryAttempt = {
  readonly channel: 'inapp' | 'email' | 'push' | 'sms';
  readonly outcome: DeliveryOutcome;
  readonly code: string;
};

/**
 * L3 — fanout honesty summary. Grace clock only if ANY channel accepted.
 * Inbox-visible only if inapp accepted. Never invents acceptance.
 */
export type FanoutHonesty = {
  readonly channels: readonly DeliveryHonesty[];
  readonly anyAccepted: boolean;
  readonly mayStartGraceClock: boolean;
  readonly mayMarkUserVisibleInbox: boolean;
};

export function fanoutHonesty(attempts: readonly ChannelDeliveryAttempt[]): FanoutHonesty {
  const channels = attempts.map((a) => deliveryHonesty({ outcome: a.outcome, channel: a.channel, code: a.code }));
  const anyAccepted = channels.some((c) => c.outcome === 'accepted');
  return {
    channels,
    anyAccepted,
    mayStartGraceClock: anyAccepted,
    mayMarkUserVisibleInbox: channels.some((c) => c.mayMarkUserVisibleInbox),
  };
}

/**
 * L3 — outcome histogram for a fanout. Empty → zeros (never invent acceptance).
 */
export type FanoutOutcomeCounts = {
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
  readonly total: number;
};

export function countFanoutOutcomes(attempts: readonly ChannelDeliveryAttempt[]): FanoutOutcomeCounts {
  let accepted = 0;
  let refused = 0;
  let failed = 0;
  for (const a of attempts) {
    if (a.outcome === 'accepted') accepted += 1;
    else if (a.outcome === 'refused') refused += 1;
    else if (a.outcome === 'failed') failed += 1;
  }
  return { accepted, refused, failed, total: attempts.length };
}

/**
 * L3 — true if any channel failed (not refused). Empty → false.
 */
export function hasFanoutFailure(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return attempts.some((a) => a.outcome === 'failed');
}

/**
 * L3 — count of failed channel attempts (not refused). Empty → 0.
 */
export function countFanoutFailures(attempts: readonly ChannelDeliveryAttempt[]): number {
  return attempts.filter((a) => a.outcome === 'failed').length;
}

/**
 * L3 — true when every attempt refused (no accept, no fail). Empty → false.
 */
export function allChannelsRefused(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  if (attempts.length === 0) return false;
  return attempts.every((a) => a.outcome === 'refused');
}

/**
 * L3 — true when every attempt accepted. Empty → false (no invent success).
 */
export function allChannelsAccepted(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  if (attempts.length === 0) return false;
  return attempts.every((a) => a.outcome === 'accepted');
}

/**
 * L3 — count of refused channel attempts. Empty → 0.
 */
export function countFanoutRefusals(attempts: readonly ChannelDeliveryAttempt[]): number {
  return attempts.filter((a) => a.outcome === 'refused').length;
}

/**
 * L3 — true if any channel accepted. Empty → false (no invent success).
 */
export function hasAnyFanoutAcceptance(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return attempts.some((a) => a.outcome === 'accepted');
}

/**
 * L3 — channels that accepted (order preserved). Empty → [].
 */
export function acceptedChannels(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt['channel'][] {
  return attempts.filter((a) => a.outcome === 'accepted').map((a) => a.channel);
}

/**
 * L3 — channels that failed transport (not refused). Empty → [].
 */
export function failedChannels(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt['channel'][] {
  return attempts.filter((a) => a.outcome === 'failed').map((a) => a.channel);
}

/**
 * L3 — channels that refused (order preserved). Empty → [].
 */
export function refusedChannels(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt['channel'][] {
  return attempts.filter((a) => a.outcome === 'refused').map((a) => a.channel);
}

/**
 * L3 — accepted/total as fixed 4dp string. Empty → null (never invent 0 success).
 */
export function fanoutAcceptanceRatio(attempts: readonly ChannelDeliveryAttempt[]): string | null {
  if (attempts.length === 0) return null;
  const accepted = attempts.filter((a) => a.outcome === 'accepted').length;
  return (accepted / attempts.length).toFixed(4);
}

/** L3 — count of accepted channel attempts. Empty → 0. */
export function countFanoutAccepted(attempts: readonly ChannelDeliveryAttempt[]): number {
  return attempts.filter((a) => a.outcome === 'accepted').length;
}

/**
 * L3 — failed/total as fixed 4dp string. Empty → null (never invent 0 failure).
 */
export function fanoutFailureRatio(attempts: readonly ChannelDeliveryAttempt[]): string | null {
  if (attempts.length === 0) return null;
  return (countFanoutFailures(attempts) / attempts.length).toFixed(4);
}

/** L3 — true when fanout attempt list is empty. */
export function fanoutIsEmpty(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return attempts.length === 0;
}

/** L3 — total attempt count. Empty → 0. */
export function fanoutAttemptCount(attempts: readonly ChannelDeliveryAttempt[]): number {
  return attempts.length;
}

/**
 * L3 — refused/total as fixed 4dp. Empty → null (never invent 0 refusal).
 */
export function fanoutRefusalRatio(attempts: readonly ChannelDeliveryAttempt[]): string | null {
  if (attempts.length === 0) return null;
  return (countFanoutRefusals(attempts) / attempts.length).toFixed(4);
}

/** L3 — true when any attempt failed. Alias surface of hasFanoutFailure. */
export function fanoutHasFailure(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return hasFanoutFailure(attempts);
}

/** L3 — true when fanout has mixed outcomes. Empty → false. */
export function fanoutIsMixed(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  if (attempts.length === 0) return false;
  const first = attempts[0]!.outcome;
  return attempts.some((a) => a.outcome !== first);
}

/** L3 — outcomes present in stable order accepted, refused, failed. Empty → []. */
export function fanoutOutcomesPresent(attempts: readonly ChannelDeliveryAttempt[]): readonly DeliveryOutcome[] {
  const order: DeliveryOutcome[] = ['accepted', 'refused', 'failed'];
  const present = new Set(attempts.map((a) => a.outcome));
  return order.filter((o) => present.has(o));
}

/** L3 — true when fanout has zero failures. Empty → true. */
export function fanoutHasNoFailures(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return countFanoutFailures(attempts) === 0;
}

/** L3 — true when fanout has zero refusals. Empty → true. */
export function fanoutHasNoRefusals(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return countFanoutRefusals(attempts) === 0;
}

/**
 * L3 — accepted count / attempt count as fixed 4dp (alias of fanoutAcceptanceRatio).
 */
export function fanoutSuccessRatio(attempts: readonly ChannelDeliveryAttempt[]): string | null {
  return fanoutAcceptanceRatio(attempts);
}

/** L3 — true when any attempt refused. Empty → false. */
export function fanoutHasRefusal(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return countFanoutRefusals(attempts) > 0;
}

/** L3 — sorted accepted channel names. Empty → []. */
export function acceptedChannelsSorted(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt['channel'][] {
  return [...acceptedChannels(attempts)].sort();
}

/** L3 — sorted failed channel names. Empty → []. */
export function failedChannelsSorted(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt['channel'][] {
  return [...failedChannels(attempts)].sort();
}

/** L3 — sorted refused channel names. Empty → []. */
export function refusedChannelsSorted(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt['channel'][] {
  return [...refusedChannels(attempts)].sort();
}

/** L3 — true when accepted count equals attempt count (all accepted). Empty → false. */
export function fanoutFullyAccepted(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return allChannelsAccepted(attempts);
}

/** L3 — outcome histogram. Empty zeros. */
export function fanoutOutcomeHistogram(attempts: readonly ChannelDeliveryAttempt[]): {
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
} {
  return {
    accepted: countFanoutAccepted(attempts),
    refused: countFanoutRefusals(attempts),
    failed: countFanoutFailures(attempts),
  };
}

/** L3 — true when histogram has only accepted. Empty → false. */
export function fanoutHistogramOnlyAccepted(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  const h = fanoutOutcomeHistogram(attempts);
  return h.accepted > 0 && h.refused === 0 && h.failed === 0;
}

/** L3 — true when histogram has only failed. Empty → false. */
export function fanoutHistogramOnlyFailed(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  const h = fanoutOutcomeHistogram(attempts);
  return h.failed > 0 && h.accepted === 0 && h.refused === 0;
}

/** L3 — true when histogram has only refused. Empty → false. */
export function fanoutHistogramOnlyRefused(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  const h = fanoutOutcomeHistogram(attempts);
  return h.refused > 0 && h.accepted === 0 && h.failed === 0;
}

/** L3 — true when attempt count is at least n. */
export function fanoutHasAtLeastAttempts(attempts: readonly ChannelDeliveryAttempt[], n: number): boolean {
  if (!Number.isFinite(n) || n < 0) return false;
  return attempts.length >= Math.floor(n);
}

/** L3 — accepted minus failed count. */
export function fanoutAcceptedMinusFailed(attempts: readonly ChannelDeliveryAttempt[]): number {
  return countFanoutAccepted(attempts) - countFanoutFailures(attempts);
}

/** L3 — first accepted channel in attempt order. None → null. */
export function firstAcceptedChannel(attempts: readonly ChannelDeliveryAttempt[]): ChannelDeliveryAttempt['channel'] | null {
  const ch = acceptedChannels(attempts);
  return ch[0] ?? null;
}

/** L3 — first failed channel in attempt order. None → null. */
export function firstFailedChannel(attempts: readonly ChannelDeliveryAttempt[]): ChannelDeliveryAttempt['channel'] | null {
  const ch = failedChannels(attempts);
  return ch[0] ?? null;
}

/** L3 — attempt count label. */
export function fanoutAttemptCountLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return String(fanoutAttemptCount(attempts));
}

/** L3 — accepted count label. */
export function fanoutAcceptedCountLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return String(countFanoutAccepted(attempts));
}

/** L3 — failed count label. */
export function fanoutFailedCountLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return String(countFanoutFailures(attempts));
}

/** L3 — refused count label. */
export function fanoutRefusedCountLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return String(countFanoutRefusals(attempts));
}
