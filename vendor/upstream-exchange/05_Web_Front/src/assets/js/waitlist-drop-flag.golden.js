#!/usr/bin/env node
/**
 * Fail-first: waitlist.enroll callers name FlagDisabledError as unbuilt.
 * Flag off → named unbuilt, not a silent queue. Flag on → join.
 *
 * Run from 05_Web_Front: node src/assets/js/waitlist-drop-flag.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var indexPage = fs.readFileSync(path.join(root, 'pages/index/Index.vue'), 'utf8');
var registerPage = fs.readFileSync(path.join(root, 'pages/uc/Register.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) {
    throw new Error((label || needle) + ' missing ' + needle);
  }
}

assertContains(indexPage, 'mutate("identity", "waitlist.enroll"', 'Index.vue waitlist.enroll mutate');
assertContains(indexPage, 'query("identity", "waitlist.position"', 'Index.vue waitlist.position query');
assertContains(indexPage, 'FlagDisabledError', 'Index.vue FlagDisabledError');
assertContains(indexPage, 'flag.waitlist.enabled', 'Index.vue waitlist flag code');
assertContains(indexPage, 'flag.referral.queue', 'Index.vue referral flag code');
assertContains(indexPage, "intafaced.drop.unbuilt", 'Index.vue named unbuilt copy');
assertContains(indexPage, 'IxState', 'Index.vue IxState');
assertContains(indexPage, 'endpoint="/api/identity/trpc/waitlist.enroll"', 'Index.vue waitlist.enroll endpoint');
assertContains(indexPage, 'no_surface', 'Index.vue maps drop refuse to named unbuilt');

assertContains(registerPage, 'mutate("identity", "waitlist.enroll"', 'Register.vue remaining waitlist.enroll caller');
assertContains(registerPage, 'FlagDisabledError', 'Register.vue FlagDisabledError');
assertContains(registerPage, "intafaced.drop.unbuilt", 'Register.vue named unbuilt copy');
assertContains(registerPage, 'IxState', 'Register.vue IxState');
assertContains(registerPage, 'endpoint="/api/identity/trpc/waitlist.enroll"', 'Register.vue waitlist.enroll endpoint');
assertContains(registerPage, 'no_surface', 'Register.vue maps drop refuse to named unbuilt');

assertContains(lang, 'drop: {', 'en.js intafaced.drop');
assertContains(lang, 'unbuilt:', 'en.js intafaced.drop.unbuilt');
assertContains(lang, 'waitlistOff:', 'en.js intafaced.drop.waitlistOff');
assertContains(lang, 'referralOff:', 'en.js intafaced.drop.referralOff');
assertContains(lang, 'named unbuilt', 'en.js named unbuilt copy');
assertContains(lang, 'FlagDisabledError', 'en.js FlagDisabledError copy');

var copy = require('../lang/en.js').intafaced;
if (!copy || typeof copy.drop !== 'object') {
  throw new Error('en.js intafaced.drop must be an object');
}
['unbuilt', 'waitlistOff', 'referralOff'].forEach(function (key) {
  if (!copy.drop[key]) throw new Error('en.js missing intafaced.drop.' + key);
});
if (String(copy.drop.unbuilt).indexOf('named unbuilt') === -1) {
  throw new Error('en.js intafaced.drop.unbuilt must say named unbuilt');
}

console.log('waitlist-drop-flag.golden: ok');
