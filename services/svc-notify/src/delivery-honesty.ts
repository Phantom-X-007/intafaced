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
