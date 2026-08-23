/**
 * Fail-first: /invite one-tap share via identity.affiliates.createShare /
 * revokeShare / shareHits. Attribution stays affiliates.attribute (one tree).
 * Run: node src/assets/js/invite-share.golden.js  (from 05_Web_Front cwd)
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

mustHave(page, "mutate('identity', 'affiliates.createShare'", 'Invite.vue');
mustHave(page, "mutate('identity', 'affiliates.revokeShare'", 'Invite.vue');
mustHave(page, "mutate('identity', 'affiliates.shareHits'", 'Invite.vue');
mustHave(page, "mutate('identity', 'affiliates.attribute'", 'Invite.vue');
mustHave(page, 'invite.share', 'Invite.vue');
mustHave(page, 'IxState', 'Invite.vue');

mustNot(page, 'IxNoSurface', 'Invite.vue');
mustNot(page, '7200', 'Invite.vue');
mustNot(page, 'leader_share', 'Invite.vue');
mustNot(page, 'fee-share', 'Invite.vue');
mustNot(page, 'profit-share', 'Invite.vue');
mustNot(page, '135000', 'Invite.vue');
mustNot(page, 'dataFanyong', 'Invite.vue');
if (page.indexOf('%') !== -1) {
  throw new Error('Invite.vue must not contain % fee-share');
}

mustHave(lang, 'share: {', 'en.js');
mustHave(lang, 'invite: {', 'en.js');

var copy = require('../lang/en.js').invite;
if (!copy || typeof copy.share !== 'object') {
  throw new Error('en.js invite.share must be an object');
}
['title', 'lead', 'btn', 'revoke', 'url', 'hits', 'empty', 'ok'].forEach(function (key) {
  if (!copy.share[key]) {
    throw new Error('en.js missing invite.share.' + key);
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
    ['%', '7200', 'leader_share', 'fee-share', 'profit-share'].forEach(function (bad) {
      if (text.indexOf(bad) !== -1) {
        throw new Error('en.js ' + here + ' contains ' + bad);
      }
    });
  });
}
walkCopy(copy.share, 'invite.share');

console.log('ok: invite tracked share createShare / revokeShare / shareHits');
