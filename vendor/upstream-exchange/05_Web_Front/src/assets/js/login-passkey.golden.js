'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/uc/Login.vue'), 'utf8');
var copy = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || needle) + ' missing');
}

assertContains(page, 'webauthn.authOptions');
assertContains(page, 'webauthn.authVerify');
assertContains(page, 'navigator.credentials.get');
assertContains(page, 'setIxSession');
assertContains(page, 'setMember');
assertContains(page, '/uc/safe');
assertContains(page, 'auth.login');
assertContains(page, 'totpCode');
if (/localStorage\.(setItem|getItem|removeItem)/.test(page)) {
  throw new Error('must not persist login session in localStorage');
}
assertContains(page, "uc.login.passkey");
assertContains(copy, 'passkeyNeedIdentifier');
assertContains(copy, 'webauthnUnavailable');
assertContains(copy, 'webauthnCancelled');

console.log('login-passkey.golden: ok');
