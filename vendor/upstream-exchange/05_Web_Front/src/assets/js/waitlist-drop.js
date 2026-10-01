'use strict';

/**
 * What a waitlist refuse actually is.
 *
 * The wire message for a flag pin is FlagDisabledError's sentence plus the
 * stable code in brackets, for example:
 *   waitlist.enabled is off (env): pinned off by INTAFACED_FLAG_WAITLIST_ENABLED [flag.waitlist.enabled.disabled]
 *
 * `unbuilt`      — the service said waitlist.unbuilt. Nothing is wired.
 * `waitlist_off` — waitlist.enabled refused. The service exists.
 * `referral_off` — referral.queue refused. The code was not applied.
 * null           — some other answer (bad email, unknown code, email taken).
 *
 * A flag pin is not `no_surface`. no_surface means the capability was never
 * built and no call was issued. These codes come back from a call that was made.
 */
function classifyWaitlistRefuse(message) {
  if (!message) return null;
  if (message.indexOf('waitlist.unbuilt') !== -1) return 'unbuilt';
  if (message.indexOf('flag.referral.queue') !== -1 || message.indexOf('referral.queue is off') !== -1) {
    return 'referral_off';
  }
  if (message.indexOf('flag.waitlist.enabled') !== -1 || message.indexOf('waitlist.enabled is off') !== -1) {
    return 'waitlist_off';
  }
  if (message.indexOf('FlagDisabledError') !== -1) return 'waitlist_off';
  return null;
}

/** IxState reason. Unwired stays no_surface. A live refuse is flag_off. */
function waitlistRefuseReason(kind) {
  if (kind === 'unbuilt') return 'no_surface';
  if (kind === 'waitlist_off' || kind === 'referral_off') return 'flag_off';
  return null;
}

module.exports = {
  classifyWaitlistRefuse: classifyWaitlistRefuse,
  waitlistRefuseReason: waitlistRefuseReason,
};
