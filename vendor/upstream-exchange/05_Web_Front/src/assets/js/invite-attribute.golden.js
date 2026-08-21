'use strict';

/**
 * Invite page writes a referrer via identity affiliates.attribute.
 * Run from 05_Web_Front: node src/assets/js/invite-attribute.golden.js
 */
var fs = require('fs');
var path = require('path');

var vue = fs.readFileSync(path.join(__dirname, '../../pages/invite/Invite.vue'), 'utf8');
var lang = require('../lang/en.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var needle = "mutate('identity', 'affiliates.attribute'";
assert(vue.indexOf(needle) !== -1, 'Invite.vue missing ' + needle);
assert(/\{referrerId[:\s]/.test(vue) || vue.indexOf('{referrerId}') !== -1, 'Invite.vue missing {referrerId}');

['7200', 'leader_share', 'fee-share'].forEach(function(bad) {
  assert(vue.indexOf(bad) === -1, 'Invite.vue contains banned ' + bad);
});

var invite = lang.invite;
assert(invite && typeof invite === 'object', 'en.js missing invite block');

Object.keys(invite).forEach(function(key) {
  assert(/^(attribute|referrer)/.test(key), 'en.js invite.' + key + ' is not invite.attribute* or invite.referrer*');
  var value = String(invite[key]);
  ['%', '7200', 'leader_share', 'fee-share'].forEach(function(bad) {
    assert(value.indexOf(bad) === -1, 'en.js invite.' + key + ' contains ' + bad);
  });
});

assert(Object.keys(invite).some(function(k) { return k.indexOf('attribute') === 0; }), 'en.js missing invite.attribute*');
assert(Object.keys(invite).some(function(k) { return k.indexOf('referrer') === 0; }), 'en.js missing invite.referrer*');

console.log('invite-attribute.golden: ok');
