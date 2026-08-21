/**
 * Fail-first: /invite attributes a referrer via identity.affiliates.attribute.
 * Run: node src/assets/js/invite-attribute.golden.js  (from 05_Web_Front cwd)
 */
'use strict';

var fs = require('fs');
var path = require('path');

var page = fs.readFileSync(path.join(__dirname, '../../pages/invite/Invite.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../../assets/lang/en.js'), 'utf8');

function mustHave(hay, needle, where) {
  if (hay.indexOf(needle) === -1) {
    throw new Error(where + ' must contain ' + needle);
  }
}

function mustNot(hay, needle, where) {
  if (hay.indexOf(needle) !== -1) {
    throw new Error(where + ' must not contain ' + needle);
  }
}

mustHave(page, "mutate('identity', 'affiliates.attribute'", 'Invite.vue');
mustHave(page, "query('identity', 'affiliates.myReferrer'", 'Invite.vue');
mustHave(page, "query('identity', 'affiliates.policy'", 'Invite.vue');
mustHave(page, "query('identity', 'affiliates.myAccruals'", 'Invite.vue');
mustHave(page, "query('identity', 'affiliates.myAncestors'", 'Invite.vue');
mustHave(page, 'invite.referrer.empty', 'Invite.vue');
mustHave(page, 'invite.accruals.empty', 'Invite.vue');
mustHave(page, 'IxState', 'Invite.vue');

mustNot(page, 'IxNoSurface', 'Invite.vue');
mustNot(page, '7200', 'Invite.vue');
mustNot(page, 'leader_share', 'Invite.vue');
mustNot(page, 'fee-share', 'Invite.vue');
mustNot(page, '135000', 'Invite.vue');
mustNot(page, 'dataFanyong', 'Invite.vue');
if (page.indexOf('%') !== -1) {
  throw new Error('Invite.vue must not contain % fee-share');
}

mustHave(lang, 'invite: {', 'en.js');
mustHave(lang, 'attribute: {', 'en.js');
mustHave(lang, 'referrer: {', 'en.js');
mustHave(lang, 'accruals: {', 'en.js');

var copy = require('../lang/en.js').invite;
if (!copy || typeof copy.attribute !== 'object' || typeof copy.referrer !== 'object' || typeof copy.accruals !== 'object') {
  throw new Error('en.js invite.attribute, invite.referrer and invite.accruals must be objects');
}
if (!copy.referrer.empty) {
  throw new Error('en.js missing invite.referrer.empty');
}
if (!copy.accruals.empty) {
  throw new Error('en.js missing invite.accruals.empty');
}
if (!copy.attribute.btn) {
  throw new Error('en.js missing invite.attribute.btn');
}
Object.keys(copy).forEach(function (key) {
  if (!/^(attribute|referrer|accruals)/.test(key)) {
    throw new Error('en.js invite.' + key + ' is outside exclusive prefixes');
  }
});
function walkCopy(node, path) {
  Object.keys(node).forEach(function (key) {
    var value = node[key];
    var here = path + '.' + key;
    if (value && typeof value === 'object') {
      walkCopy(value, here);
      return;
    }
    var text = String(value);
    ['%', '7200', 'leader_share', 'fee-share'].forEach(function (bad) {
      if (text.indexOf(bad) !== -1) {
        throw new Error('en.js ' + here + ' contains ' + bad);
      }
    });
  });
}
walkCopy(copy, 'invite');

console.log('ok: invite attribute referrer + accruals honesty');
