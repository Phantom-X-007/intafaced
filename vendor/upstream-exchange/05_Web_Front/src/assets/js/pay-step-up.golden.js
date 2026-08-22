'use strict';

/**
 * /pay/money leftover mutate — TOTP step-up so withdrawal.create is reachable.
 * Run: node src/assets/js/pay-step-up.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/pay/Money.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(hay, needle, msg) {
  if (hay.indexOf(needle) === -1) throw new Error(msg || ('missing ' + needle));
}

function assertAbsent(hay, needle, msg) {
  if (hay.indexOf(needle) !== -1) throw new Error(msg || ('forbidden ' + needle));
}

assertContains(page, "mutate('identity', 'auth.stepUp'", 'auth.stepUp mutate missing');
assertContains(page, '{ totpCode: this.totpCode }', 'totpCode is the step-up body');
assertContains(page, "mutate(\n          'pay',\n          'withdrawal.create'", 'withdrawal.create must stay');
assertContains(page, 'setIxSession', 'step-up must store the returned accessToken on the ix session');
assertContains(page, 'intafaced.pay.moneyPage.stepUpBtn', 'step-up button copy');
assertContains(page, 'intafaced.pay.moneyPage.stepUpTotp', 'totp field copy');
assertContains(lang, 'stepUpBtn:');
assertContains(lang, 'stepUpTotp:');
assertContains(lang, 'stepUpTotpHint:');
assertAbsent(page, 'auth.stepUpOptions', 'passkey step-up is a later journey');
assertAbsent(page, "mutate('pay', 'withdrawal.create'");
if (/Number\s*\(|parseFloat\s*\(/.test(page)) {
  throw new Error('amount must stay a string — no Number/parseFloat');
}
console.log('pay-step-up.golden: ok');
