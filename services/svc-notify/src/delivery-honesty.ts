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
