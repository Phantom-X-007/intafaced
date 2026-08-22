'use strict';

/**
 * Fail-first: auth.register referrerId — send only when the user pasted a UUID.
 * Run: node src/assets/js/register-referrer.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/uc/Register.vue'), 'utf8');

if (page.indexOf('auth.register') === -1) throw new Error('auth.register missing');
if (page.indexOf('referrerId') === -1) throw new Error('referrerId missing next to auth.register');
if (page.indexOf('if (referrerId) input.referrerId') === -1) {
  throw new Error('must send referrerId only when pasted — blank must not go on the wire');
}
if (page.indexOf('referrerId: self.formInline.referrerId') !== -1) {
  throw new Error('must not always send form referrerId (empty string is not optional)');
}
if (page.indexOf('$t(\'uc.reg.referrer') === -1) throw new Error('uc.reg.referrer* copy missing');

console.log('register-referrer.golden: ok');
