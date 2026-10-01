#!/usr/bin/env node
/**
 * Fail-first: a waitlist flag pin is a built service refusing, not a shell
 * that was never wired. Unwired (`waitlist.unbuilt`) stays no_surface.
 * Flag on is a join, with position and code.
 *
 * Run from 05_Web_Front: node src/assets/js/waitlist-drop-flag.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var drop = require('./waitlist-drop.js');
var root = path.join(__dirname, '../../');
var indexPage = fs.readFileSync(path.join(root, 'pages/index/Index.vue'), 'utf8');
var registerPage = fs.readFileSync(path.join(root, 'pages/uc/Register.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) {
    throw new Error((label || needle) + ' missing ' + needle);
  }
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) {
    throw new Error((label || needle) + ' still contains ' + needle);
  }
}

var DANEN =
  'waitlist.enabled is off (env): pinned off by INTAFACED_FLAG_WAITLIST_ENABLED [flag.waitlist.enabled.disabled]';

if (drop.classifyWaitlistRefuse(DANEN) !== 'waitlist_off') {
  throw new Error('Danen flag pin must classify as waitlist_off');
}
if (drop.waitlistRefuseReason('waitlist_off') !== 'flag_off') {
  throw new Error('waitlist_off must be flag_off, not no_surface');
}
if (
  drop.classifyWaitlistRefuse(
    'referral.queue is off (env): pinned off by INTAFACED_FLAG_REFERRAL_QUEUE [flag.referral.queue.disabled]',
  ) !== 'referral_off'
) {
  throw new Error('referral pin must classify as referral_off');
}
if (drop.waitlistRefuseReason('referral_off') !== 'flag_off') {
  throw new Error('referral_off must be flag_off');
}
if (drop.classifyWaitlistRefuse('Waitlist capture is not wired [waitlist.unbuilt]') !== 'unbuilt') {
  throw new Error('unwired waitlist must stay unbuilt');
}
if (drop.waitlistRefuseReason('unbuilt') !== 'no_surface') {
  throw new Error('unbuilt stays no_surface');
}
if (drop.classifyWaitlistRefuse('An account with that email already exists.') !== null) {
  throw new Error('email taken is not a drop refuse');
}
if (drop.classifyWaitlistRefuse('auth.email_taken') !== null) {
  throw new Error('a raw auth code is not a drop refuse');
}

assertContains(indexPage, 'waitlist-drop.js', 'Index.vue uses the shared classifier');
assertContains(indexPage, 'mutate("identity", "waitlist.enroll"', 'Index.vue waitlist.enroll mutate');
assertContains(indexPage, 'query("identity", "waitlist.position"', 'Index.vue waitlist.position query');
assertContains(indexPage, 'classifyWaitlistRefuse', 'Index.vue classifies the refuse');
assertContains(indexPage, 'waitlistRefuseReason', 'Index.vue maps the refuse to an IxState reason');
assertContains(indexPage, 'intafaced.drop.unbuilt', 'Index.vue unwired copy');
assertContains(indexPage, 'intafaced.drop.waitlistOff', 'Index.vue flag-off copy');
assertContains(indexPage, 'intafaced.drop.referralOff', 'Index.vue referral-off copy');
assertContains(indexPage, 'intafaced.waitlist.joined', 'Index.vue joined copy');
assertContains(indexPage, 'intafaced.waitlist.already', 'Index.vue already-on-list copy');
assertContains(indexPage, 'intafaced.waitlist.referredCount', 'Index.vue referred count');
assertContains(indexPage, 'intafaced.waitlist.queueLength', 'Index.vue queue length');
assertContains(indexPage, 'IxState', 'Index.vue IxState');
assertContains(indexPage, 'endpoint="/api/identity/trpc/waitlist.enroll"', 'Index.vue waitlist.enroll endpoint');
assertAbsent(indexPage, 'reason = "no_surface"', 'Index.vue must not stamp every flag pin as never built');
assertAbsent(indexPage, 'nameDropUnbuilt', 'Index.vue must not prefix the unbuilt sentence onto a live refuse');

assertContains(registerPage, 'waitlist-drop.js', 'Register.vue uses the shared classifier');
assertContains(registerPage, 'mutate("identity", "waitlist.enroll"', 'Register.vue waitlist.enroll caller');
assertContains(registerPage, 'classifyWaitlistRefuse', 'Register.vue classifies the refuse');
assertContains(registerPage, 'waitlistRefuseReason', 'Register.vue maps the refuse');
assertContains(registerPage, 'intafaced.drop.unbuilt', 'Register.vue unwired copy');
assertContains(registerPage, 'intafaced.drop.waitlistOff', 'Register.vue flag-off copy');
assertContains(registerPage, 'intafaced.waitlist.joined', 'Register.vue shows the queue place');
assertContains(registerPage, 'intafaced.waitlist.yourCode', 'Register.vue shows the issued code');
assertContains(registerPage, 'IxState', 'Register.vue IxState');
assertContains(registerPage, 'endpoint="/api/identity/trpc/waitlist.enroll"', 'Register.vue waitlist.enroll endpoint');
assertContains(registerPage, 'uc.regist.agreementMissing', 'Register.vue states the agreement is unpublished');
assertAbsent(registerPage, 'reason = "no_surface"', 'Register.vue must not stamp a flag pin as never built');
assertAbsent(registerPage, 'helpdetail?cate=1&id=35', 'Register.vue must not link a missing user agreement');
assertAbsent(registerPage, 'v-model="agree"', 'Register.vue must not require consent to an unpublished document');

assertContains(lang, 'drop: {', 'en.js intafaced.drop');
assertContains(lang, 'unbuilt:', 'en.js intafaced.drop.unbuilt');
assertContains(lang, 'waitlistOff:', 'en.js intafaced.drop.waitlistOff');
assertContains(lang, 'referralOff:', 'en.js intafaced.drop.referralOff');
assertContains(lang, 'flag_off:', 'en.js flag_off reason');
assertContains(lang, 'This switch is off', 'en.js flag_off title');
assertContains(lang, 'joined:', 'en.js joined copy');
assertContains(lang, 'already:', 'en.js already copy');
assertContains(lang, 'agreementMissing:', 'en.js unpublished agreement');
assertAbsent(lang, 'named unbuilt', 'en.js must not call a built flag pin unbuilt');

var copy = require('../lang/en.js').intafaced;
if (!copy || typeof copy.drop !== 'object') {
  throw new Error('en.js intafaced.drop must be an object');
}
['unbuilt', 'waitlistOff', 'referralOff'].forEach(function (key) {
  if (!copy.drop[key]) throw new Error('en.js missing intafaced.drop.' + key);
});
if (!copy.reason || !copy.reason.flag_off || !copy.reason.flag_off.title) {
  throw new Error('en.js missing intafaced.reason.flag_off');
}
if (String(copy.drop.waitlistOff).indexOf('switched off') === -1) {
  throw new Error('waitlistOff must say the switch is off');
}
if (String(copy.drop.unbuilt).indexOf('not wired') === -1) {
  throw new Error('unbuilt must say the service is not wired');
}

var hex = drop.inviteCodeFromQuery('AbCDef012345');
if (!hex || hex.kind !== 'waitlist' || hex.value !== 'abcdef012345') {
  throw new Error('a 12-hex query code must become a lowercase waitlist code');
}
var uuid = drop.inviteCodeFromQuery('11111111-1111-4111-8111-111111111111');
if (!uuid || uuid.kind !== 'affiliate') throw new Error('a UUID query code is an affiliate id');
if (drop.inviteCodeFromQuery('not-a-code') !== null) throw new Error('junk query code must stay unused');
if (drop.inviteCodeFromQuery('') !== null) throw new Error('blank query code must stay unused');
if (drop.inviteCodeFromQuery(['AbCDef012345']) === null) throw new Error('array query code must be read');
if (!drop.isWaitlistCode('abcdef012345')) throw new Error('isWaitlistCode accepts 12 hex');
if (drop.isWaitlistCode('11111111-1111-4111-8111-111111111111')) {
  throw new Error('an account UUID is not a waitlist code');
}
if (drop.waitlistSharePath('AbCDef012345') !== '/register?code=abcdef012345') {
  throw new Error('share path must fill /register?code=');
}
if (drop.waitlistSharePath('not-a-code') !== '') throw new Error('a bad code has no share path');

assertContains(indexPage, 'inviteCodeFromQuery', 'Index.vue reads ?code=');
assertContains(indexPage, 'isWaitlistCode', 'Index.vue checks the code shape before enroll');
assertContains(indexPage, 'waitlistSharePath', 'Index.vue shows the share link');
assertContains(indexPage, 'intafaced.waitlist.share', 'Index.vue share copy');
assertContains(indexPage, 'intafaced.waitlist.codeShape', 'Index.vue code shape copy');
assertContains(registerPage, 'inviteCodeFromQuery', 'Register.vue reads ?code=');
assertContains(registerPage, 'applyRouteCode', 'Register.vue applies the route code');
assertContains(registerPage, 'waitlistSharePath', 'Register.vue shows the share link');
assertContains(lang, 'share:', 'en.js share copy');
assertContains(lang, 'codeShape:', 'en.js code shape copy');
if (!copy.waitlist || !copy.waitlist.share) throw new Error('en.js missing intafaced.waitlist.share');

console.log('waitlist-drop-flag.golden: ok');
