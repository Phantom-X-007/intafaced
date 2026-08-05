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
