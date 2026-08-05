/**
 * Notify L3 — combined mute + digest prefs (TRK-ops.notifications).
 *
 * Single pure view for dispatch: critical always immediate and never muted;
 * non-critical may mute channels and/or batch into digests.
 */

import { isChannelMuted, type ChannelMutePrefs, type MuteableChannel, type NotifySeverity, EMPTY_MUTE_PREFS } from './mute.js';
import { DEFAULT_DIGEST_PREFS, mayEnterDigest, shouldSendImmediate, type DigestPrefs } from './digest.js';

export type CombinedNotifyPrefs = {
  readonly mute: ChannelMutePrefs;
  readonly digest: DigestPrefs;
};

export const DEFAULT_COMBINED_PREFS: CombinedNotifyPrefs = {
  mute: EMPTY_MUTE_PREFS,
  digest: DEFAULT_DIGEST_PREFS,
};

export type DeliveryDecision =
  | { readonly action: 'send_now'; readonly channel: MuteableChannel | 'inapp' }
  | { readonly action: 'hold_digest'; readonly channel: MuteableChannel }
  | { readonly action: 'skip_muted'; readonly channel: MuteableChannel }
  | { readonly action: 'inapp_only' };

/**
 * Decide out-of-app delivery for one channel.
 * inapp is never muted and never digests (inbox lands immediately).
 */
export function decideChannelDelivery(
  prefs: CombinedNotifyPrefs,
  channel: MuteableChannel | 'inapp',
  severity: NotifySeverity,
): DeliveryDecision {
  if (channel === 'inapp') {
    return { action: 'send_now', channel: 'inapp' };
  }
  if (isChannelMuted(prefs.mute, channel, severity)) {
    return { action: 'skip_muted', channel };
  }
  if (!shouldSendImmediate(prefs.digest, severity) && mayEnterDigest(severity)) {
    return { action: 'hold_digest', channel };
  }
  return { action: 'send_now', channel };
}

/** Critical fanout never digests and never skips muteable channels as muted. */
export function criticalAlwaysImmediate(prefs: CombinedNotifyPrefs, channel: MuteableChannel): boolean {
  const d = decideChannelDelivery(prefs, channel, 'critical');
  return d.action === 'send_now';
}

/**
 * L3 — plan delivery for a multi-channel fanout in one pass.
 * Channels list is caller-owned; missing channels are not invented.
 */
export function planFanoutDelivery(
  prefs: CombinedNotifyPrefs,
  channels: readonly (MuteableChannel | 'inapp')[],
  severity: NotifySeverity,
): readonly DeliveryDecision[] {
  return channels.map((ch) => decideChannelDelivery(prefs, ch, severity));
}

/**
 * L3 — summarize a fanout plan by action (operator honesty board).
 * Empty plan → zeros; never invents channels not in the plan.
 */
export type FanoutPlanSummary = {
  readonly sendNow: number;
  readonly holdDigest: number;
  readonly skipMuted: number;
  readonly total: number;
};

export function summarizeFanoutPlan(plan: readonly DeliveryDecision[]): FanoutPlanSummary {
  let sendNow = 0;
  let holdDigest = 0;
  let skipMuted = 0;
  for (const d of plan) {
    if (d.action === 'send_now') sendNow += 1;
    else if (d.action === 'hold_digest') holdDigest += 1;
    else if (d.action === 'skip_muted') skipMuted += 1;
  }
  return { sendNow, holdDigest, skipMuted, total: plan.length };
}

/** L3 — channels that should send immediately (no invent missing channels). */
export function channelsToSendNow(plan: readonly DeliveryDecision[]): readonly (MuteableChannel | 'inapp')[] {
  return plan.filter((d): d is Extract<DeliveryDecision, { action: 'send_now' }> => d.action === 'send_now').map((d) => d.channel);
}

/** L3 — channels held for digest (no invent; never inapp). */
export function channelsHeldForDigest(plan: readonly DeliveryDecision[]): readonly MuteableChannel[] {
  return plan.filter((d): d is Extract<DeliveryDecision, { action: 'hold_digest' }> => d.action === 'hold_digest').map((d) => d.channel);
}

/** L3 — channels skipped as muted (no invent; never inapp). */
export function channelsSkippedMuted(plan: readonly DeliveryDecision[]): readonly MuteableChannel[] {
  return plan.filter((d): d is Extract<DeliveryDecision, { action: 'skip_muted' }> => d.action === 'skip_muted').map((d) => d.channel);
}

/** L3 — count of hold_digest decisions. Empty plan → 0. */
export function countHoldingChannels(plan: readonly DeliveryDecision[]): number {
  return channelsHeldForDigest(plan).length;
}

/** L3 — count of send_now decisions. Empty plan → 0. */
export function countSendNowChannels(plan: readonly DeliveryDecision[]): number {
  return channelsToSendNow(plan).length;
}

/** L3 — count of skip_muted decisions. Empty plan → 0. */
export function countSkippedMuted(plan: readonly DeliveryDecision[]): number {
  return channelsSkippedMuted(plan).length;
}

/**
 * L3 — true when plan has zero skip_muted decisions. Empty plan → true.
 */
export function planHasNoMutes(plan: readonly DeliveryDecision[]): boolean {
  return countSkippedMuted(plan) === 0;
}

/**
 * L3 — true when every decision is send_now. Empty plan → false (not invent all-send).
 */
export function planIsAllSendNow(plan: readonly DeliveryDecision[]): boolean {
  if (plan.length === 0) return false;
  return plan.every((d) => d.action === 'send_now');
}

/** L3 — true when fanout plan has no decisions. */
export function planIsEmpty(plan: readonly DeliveryDecision[]): boolean {
  return plan.length === 0;
}

/** L3 — true when any decision is hold_digest. Empty → false. */
export function planHasHolds(plan: readonly DeliveryDecision[]): boolean {
  return countHoldingChannels(plan) > 0;
}

/** L3 — true when any decision is skip_muted. Empty → false. */
export function planHasSkips(plan: readonly DeliveryDecision[]): boolean {
  return plan.some((d) => d.action === 'skip_muted');
}

/** L3 — send_now count. Empty → 0. */
export function countSendNow(plan: readonly DeliveryDecision[]): number {
  return plan.filter((d) => d.action === 'send_now').length;
}

/** L3 — alias of countSkippedMuted. */
export function planSkipCount(plan: readonly DeliveryDecision[]): number {
  return countSkippedMuted(plan);
}
