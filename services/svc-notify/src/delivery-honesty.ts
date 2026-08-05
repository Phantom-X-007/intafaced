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

/** L3 — accepted channels joined (sorted). Empty → "". */
export function acceptedChannelsJoined(attempts: readonly ChannelDeliveryAttempt[]): string {
  return acceptedChannelsSorted(attempts).join(',');
}

/** L3 — failed channels joined (sorted). Empty → "". */
export function failedChannelsJoined(attempts: readonly ChannelDeliveryAttempt[]): string {
  return failedChannelsSorted(attempts).join(',');
}

/** L3 — refused channels joined (sorted). Empty → "". */
export function refusedChannelsJoined(attempts: readonly ChannelDeliveryAttempt[]): string {
  return refusedChannelsSorted(attempts).join(',');
}

/** L3 — outcomes present joined. Empty → "". */
export function fanoutOutcomesPresentJoined(attempts: readonly ChannelDeliveryAttempt[]): string {
  return fanoutOutcomesPresent(attempts).join(',');
}

/** L3 — acceptance ratio label or empty. */
export function fanoutAcceptanceRatioLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return fanoutAcceptanceRatio(attempts) ?? '';
}

/** L3 — failure ratio label or empty. */
export function fanoutFailureRatioLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return fanoutFailureRatio(attempts) ?? '';
}

/** L3 — refusal ratio label or empty. */
export function fanoutRefusalRatioLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return fanoutRefusalRatio(attempts) ?? '';
}

/** L3 — first accepted channel label or empty. */
export function firstAcceptedChannelLabel(attempts: readonly ChannelDeliveryAttempt[]): string {
  return firstAcceptedChannel(attempts) ?? '';
}

/** L3 — outcome snapshot with total. */
export function fanoutOutcomeSnapshot(attempts: readonly ChannelDeliveryAttempt[]): {
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
  readonly total: number;
} {
  const h = fanoutOutcomeHistogram(attempts);
  return { ...h, total: attempts.length };
}

/** L3 — true when outcomes sum to attempts. */
export function fanoutOutcomeCountsConsistent(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  const s = fanoutOutcomeSnapshot(attempts);
  return s.total === s.accepted + s.refused + s.failed;
}

/** L3 — ratio snapshot (nulls when empty). */
export function fanoutRatioSnapshot(attempts: readonly ChannelDeliveryAttempt[]): {
  readonly acceptance: string | null;
  readonly failure: string | null;
  readonly refusal: string | null;
} {
  return {
    acceptance: fanoutAcceptanceRatio(attempts),
    failure: fanoutFailureRatio(attempts),
    refusal: fanoutRefusalRatio(attempts),
  };
}

/** L3 — channel lists snapshot. */
export function fanoutChannelLists(attempts: readonly ChannelDeliveryAttempt[]): {
  readonly accepted: readonly ChannelDeliveryAttempt['channel'][];
  readonly failed: readonly ChannelDeliveryAttempt['channel'][];
  readonly refused: readonly ChannelDeliveryAttempt['channel'][];
} {
  return {
    accepted: acceptedChannels(attempts),
    failed: failedChannels(attempts),
    refused: refusedChannels(attempts),
  };
}

/** L3 — fanout honesty board card. */
export function fanoutBoardCard(attempts: readonly ChannelDeliveryAttempt[]): {
  readonly total: number;
  readonly accepted: number;
  readonly refused: number;
  readonly failed: number;
  readonly empty: boolean;
  readonly fullyAccepted: boolean;
  readonly mixed: boolean;
  readonly acceptanceRatio: string | null;
  readonly outcomes: readonly DeliveryOutcome[];
} {
  const s = fanoutOutcomeSnapshot(attempts);
  return {
    total: s.total,
    accepted: s.accepted,
    refused: s.refused,
    failed: s.failed,
    empty: fanoutIsEmpty(attempts),
    fullyAccepted: fanoutFullyAccepted(attempts),
    mixed: fanoutIsMixed(attempts),
    acceptanceRatio: fanoutAcceptanceRatio(attempts),
    outcomes: fanoutOutcomesPresent(attempts),
  };
}

/** L3 — true when fanout board has failures. */
export function fanoutBoardHasFailures(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return fanoutBoardCard(attempts).failed > 0;
}

/** L3 — true when fanout board is empty. */
export function fanoutBoardIsEmpty(attempts: readonly ChannelDeliveryAttempt[]): boolean {
  return fanoutBoardCard(attempts).empty;
}

/** L3 — channel lists for fanout board. */
export function fanoutBoardChannels(attempts: readonly ChannelDeliveryAttempt[]): {
  readonly accepted: readonly ChannelDeliveryAttempt['channel'][];
  readonly failed: readonly ChannelDeliveryAttempt['channel'][];
  readonly refused: readonly ChannelDeliveryAttempt['channel'][];
} {
  return fanoutChannelLists(attempts);
}

/** L3 — filter attempts by outcome. Empty → []. */
export function filterAttemptsByOutcome(
  attempts: readonly ChannelDeliveryAttempt[],
  outcome: DeliveryOutcome,
): readonly ChannelDeliveryAttempt[] {
  return attempts.filter((a) => a.outcome === outcome);
}

/** L3 — true when any attempt has outcome. */
export function fanoutIncludesOutcome(attempts: readonly ChannelDeliveryAttempt[], outcome: DeliveryOutcome): boolean {
  return attempts.some((a) => a.outcome === outcome);
}

/** L3 — count attempts for outcome. Empty → 0. */
export function countAttemptsWithOutcome(attempts: readonly ChannelDeliveryAttempt[], outcome: DeliveryOutcome): number {
  return filterAttemptsByOutcome(attempts, outcome).length;
}

/** L3 — filter channels by substring among accepted. Empty needle → []. */
export function filterAcceptedChannels(
  attempts: readonly ChannelDeliveryAttempt[],
  needle: string,
): readonly ChannelDeliveryAttempt['channel'][] {
  const n = needle.trim();
  if (!n) return [];
  return acceptedChannels(attempts).filter((c) => c.includes(n));
}

/** L3 — page fanout attempts. Empty → []. */
export function pageFanoutAttempts(
  attempts: readonly ChannelDeliveryAttempt[],
  options: { offset?: number; limit?: number } = {},
): readonly ChannelDeliveryAttempt[] {
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(0, Math.floor(options.limit ?? attempts.length));
  return attempts.slice(offset, offset + limit);
}

/** L3 — page accepted channels. Empty → []. */
export function pageAcceptedChannels(
  attempts: readonly ChannelDeliveryAttempt[],
  options: { offset?: number; limit?: number } = {},
): readonly ChannelDeliveryAttempt['channel'][] {
  const all = acceptedChannels(attempts);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(0, Math.floor(options.limit ?? all.length));
  return all.slice(offset, offset + limit);
}

/** L3 — fanout page count. */
export function fanoutPageCount(attempts: readonly ChannelDeliveryAttempt[], pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return 0;
  const n = attempts.length;
  if (n === 0) return 0;
  return Math.ceil(n / Math.floor(pageSize));
}

/** L3 — reverse attempts. Empty → []. */
export function reverseFanoutAttempts(attempts: readonly ChannelDeliveryAttempt[]): readonly ChannelDeliveryAttempt[] {
  return [...attempts].reverse();
}

/** L3 — accepted channels only in left fanout. */
export function acceptedChannelsOnlyLeft(
  left: readonly ChannelDeliveryAttempt[],
  right: readonly ChannelDeliveryAttempt[],
): readonly ChannelDeliveryAttempt['channel'][] {
  const r = new Set(acceptedChannels(right));
  return acceptedChannels(left).filter((c) => !r.has(c));
}

/** L3 — accepted count delta (left - right). */
export function fanoutAcceptedCountDelta(left: readonly ChannelDeliveryAttempt[], right: readonly ChannelDeliveryAttempt[]): number {
  return countFanoutAccepted(left) - countFanoutAccepted(right);
}

/** L3 — true when fanouts same size. */
export function fanoutsSameSize(left: readonly ChannelDeliveryAttempt[], right: readonly ChannelDeliveryAttempt[]): boolean {
  return left.length === right.length;
}

/** L3 — true when outcome histograms equal. */
export function fanoutsSameOutcomeHistogram(left: readonly ChannelDeliveryAttempt[], right: readonly ChannelDeliveryAttempt[]): boolean {
  const a = fanoutOutcomeHistogram(left);
  const b = fanoutOutcomeHistogram(right);
  return a.accepted === b.accepted && a.refused === b.refused && a.failed === b.failed;
}
