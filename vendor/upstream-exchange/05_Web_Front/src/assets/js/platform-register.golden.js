/**
 * Fail-first: /platform Register is wired to identity.auth.register.
 * Run from 05_Web_Front:  node src/assets/js/platform-register.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Platform.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error(label || needle);
}

assertContains(page, "mutate('identity', 'auth.register'", 'Platform.vue must call mutate(identity, auth.register)');
assertContains(page, 'IxState', 'register refuse must render in IxState');
assertContains(page, "setIxSession", 'register ok must commit the session');
assertContains(page, "setMember", 'register ok must project member like signIn');
assertContains(page, "mutate('identity', 'auth.logout'", 'signOut must revoke refresh when the session carries one');
assertContains(page, 'session.refreshToken', 'logout must read refreshToken from the session object, not invent one');

if (/registrationOpen\s*[:=]\s*true/.test(page)) {
  throw new Error('do not invent registrationOpen=true');
}

assertContains(lang, 'registerTitle:', 'en.js intafaced.hub.registerTitle');
assertContains(lang, 'registerHandle:', 'en.js intafaced.hub.registerHandle');
assertContains(lang, 'registerEmail:', 'en.js intafaced.hub.registerEmail');
assertContains(lang, 'registerPassword:', 'en.js intafaced.hub.registerPassword');
assertContains(lang, 'registerHandleInvalid:', 'en.js intafaced.hub.registerHandleInvalid');
assertContains(lang, 'registerEmailInvalid:', 'en.js intafaced.hub.registerEmailInvalid');
assertContains(lang, 'registerPasswordShort:', 'en.js intafaced.hub.registerPasswordShort');

console.log('ok: platform register golden');
