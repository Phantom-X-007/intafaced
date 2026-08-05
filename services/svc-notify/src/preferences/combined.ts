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
  return plan.filter((d): d is { action: 'send_now'; channel: MuteableChannel | 'inapp' } => d.action === 'send_now').map((d) => d.channel);
}

/** L3 — channels held for digest (no invent). */
export function channelsHeldForDigest(plan: readonly DeliveryDecision[]): readonly (MuteableChannel | 'inapp')[] {
  return plan
    .filter((d): d is { action: 'hold_digest'; channel: MuteableChannel | 'inapp' } => d.action === 'hold_digest')
    .map((d) => d.channel);
}

/** L3 — channels skipped as muted (no invent). */
export function channelsSkippedMuted(plan: readonly DeliveryDecision[]): readonly (MuteableChannel | 'inapp')[] {
  return plan
    .filter((d): d is { action: 'skip_muted'; channel: MuteableChannel | 'inapp' } => d.action === 'skip_muted')
    .map((d) => d.channel);
}
