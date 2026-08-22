/**
 * Fail-first: /uc/safe drives identity webauthn enrol, not a mocked credential.
 * Run from 05_Web_Front:  node src/assets/js/safe-webauthn.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../components/uc/Safe.vue'), 'utf8');
var en = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

if (page.indexOf("mutate('identity', 'webauthn.registerOptions'") === -1) {
  throw new Error("fail-first: Safe.vue must contain mutate('identity', 'webauthn.registerOptions'");
}
if (page.indexOf("webauthn.registerVerify") === -1) {
  throw new Error("fail-first: Safe.vue must contain webauthn.registerVerify");
}
if (page.indexOf("mutate('identity', 'webauthn.registerVerify'") === -1) {
  throw new Error("fail-first: Safe.vue must contain mutate('identity', 'webauthn.registerVerify'");
}
if (page.indexOf('navigator.credentials.create') === -1) {
  throw new Error('Safe.vue must call navigator.credentials.create after registerOptions');
}
if (page.indexOf('uc.safe.noKeys') === -1) {
  throw new Error('empty list must stay uc.safe.noKeys, not 0');
}
if (page.indexOf('keysEnrolSocket') !== -1) {
  throw new Error('keysEnrolSocket must be gone once enroll exists');
}
if (page.indexOf('uc.safe.webauthnEnrollBtn') === -1) {
  throw new Error('enroll button copy key missing');
}
if (en.indexOf('webauthnEnrollBtn') === -1) {
  throw new Error('en.js must define uc.safe.webauthnEnrollBtn');
}

console.log('safe-webauthn.golden: ok');
