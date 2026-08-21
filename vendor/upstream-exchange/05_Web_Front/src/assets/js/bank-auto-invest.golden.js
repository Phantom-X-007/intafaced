'use strict';
/**
 * Fail-first pin: /bank wires autoInvest.createThresholdSweep as a decimal-string
 * mutate, lists rules with empty≠0, and does not invent DCA rates or a new route.
 *
 * Run from 05_Web_Front:  node src/assets/js/bank-auto-invest.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error(label + ' missing ' + needle);
}

function assertAbsent(value, needle, label) {
  if (value.indexOf(needle) !== -1) throw new Error(label + ' must not contain ' + needle);
}

var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
assertAbsent(routes, "path: '/bank/auto-invest'", 'routes.js');
assertContains(routes, "path: '/bank'", 'routes.js');

var page = fs.readFileSync(path.join(root, 'pages/intafaced/Bank.vue'), 'utf8');
assertContains(page, "mutate('bank', 'autoInvest.createThresholdSweep'", 'Bank.vue');
assertContains(page, "query('bank', 'autoInvest.list'", 'Bank.vue');
assertContains(page, 'threshold: this.sweep.threshold', 'Bank.vue');
assertContains(page, 'intafaced.bank.autoInvest.noRules', 'Bank.vue');
assertContains(page, 'rules.data && rules.data.length', 'Bank.vue');
assertContains(page, 'endpoint="/api/bank/trpc/autoInvest.createThresholdSweep"', 'Bank.vue');
assertAbsent(page, 'createDca', 'Bank.vue');
assertAbsent(page, 'Number(this.sweep.threshold', 'Bank.vue');
assertAbsent(page, 'parseFloat', 'Bank.vue');
assertAbsent(page, 'parseInt', 'Bank.vue');
assertAbsent(page, "path: '/bank/auto-invest'", 'Bank.vue');

var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(lang, 'autoInvest:', 'en.js');
assertContains(lang, 'noRules:', 'en.js');

console.log('bank-auto-invest.golden: ok');
