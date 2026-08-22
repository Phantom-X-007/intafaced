'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("mutate('academy', 'invite'") === -1) throw new Error('invite missing');
if (page.indexOf('if (expiresAt) input.expiresAt = expiresAt;') === -1) {
  throw new Error('blank expiresAt must be omitted, not sent empty');
}
if (page.indexOf('expiresAt: new Date') !== -1 || page.indexOf('Date.parse') !== -1) {
  throw new Error('expiresAt must stay an ISO string, not a Date');
}
if (page.indexOf("reason === 'academy.not_host'") !== -1 || page.indexOf("reason === 'academy.room_not_found'") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist academy invite in localStorage');
if (en.indexOf('inviteLead:') === -1) throw new Error('inviteLead i18n missing');
if (en.indexOf('inviteUserId:') === -1) throw new Error('inviteUserId i18n missing');
if (en.indexOf('inviteExpiresAt:') === -1) throw new Error('inviteExpiresAt i18n missing');
if (en.indexOf('inviteSubmit:') === -1) throw new Error('inviteSubmit i18n missing');
if (en.indexOf('inviteSignIn:') === -1) throw new Error('inviteSignIn i18n missing');
if (en.indexOf('inviteInvited:') === -1) throw new Error('inviteInvited i18n missing');

console.log('academy-invite.golden: ok');
