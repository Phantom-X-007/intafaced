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

/**
 * Catalog key for the sentence a person can read. Empty when the message
 * is not a drop refuse. Pages translate the key; they do not each keep a copy.
 */
function waitlistRefuseCopyKey(kind) {
  if (kind === 'unbuilt') return 'intafaced.drop.unbuilt';
  if (kind === 'referral_off') return 'intafaced.drop.referralOff';
  if (kind === 'waitlist_off') return 'intafaced.drop.waitlistOff';
  return '';
}

var WAITLIST_CODE_RE = /^[a-fA-F0-9]{12}$/;
var ACCOUNT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `?code=` on /reg is forwarded to /register. A 12-hex value is a waitlist
 * code. A UUID is an affiliate account id. Anything else is left unused.
 */
function inviteCodeFromQuery(raw) {
  if (Array.isArray(raw)) raw = raw[0];
  if (raw == null) return null;
  var text = String(raw).trim();
  if (WAITLIST_CODE_RE.test(text)) return { kind: 'waitlist', value: text.toLowerCase() };
  if (ACCOUNT_UUID_RE.test(text)) return { kind: 'affiliate', value: text };
  return null;
}

function isWaitlistCode(raw) {
  var parsed = inviteCodeFromQuery(raw);
  return !!(parsed && parsed.kind === 'waitlist');
}

/** Path that fills the register referrer field with this waitlist code. */
function waitlistSharePath(code) {
  var parsed = inviteCodeFromQuery(code);
  if (!parsed || parsed.kind !== 'waitlist') return '';
  return '/register?code=' + parsed.value;
}

module.exports = {
  classifyWaitlistRefuse: classifyWaitlistRefuse,
  waitlistRefuseReason: waitlistRefuseReason,
  waitlistRefuseCopyKey: waitlistRefuseCopyKey,
  inviteCodeFromQuery: inviteCodeFromQuery,
  isWaitlistCode: isWaitlistCode,
  waitlistSharePath: waitlistSharePath,
};
