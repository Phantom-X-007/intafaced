'use strict';
/**
 * Fail-first pin: /bank/ramps wires ramps.setWithdrawDestination as kind+ref
 * and does not invent ramps.onramp or move value in the shell.
 *
 * Run from 05_Web_Front:  node src/assets/js/ramps-withdraw-dest.golden.js
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

var page = fs.readFileSync(path.join(root, 'pages/intafaced/bank/Ramps.vue'), 'utf8');
assertContains(page, "mutate('bank', 'ramps.setWithdrawDestination'", 'Ramps.vue');
assertContains(page, '{ kind: this.dest.kind, ref: this.dest.ref }', 'Ramps.vue');
assertContains(page, 'intafaced.bank.ramps.withdrawDestSave', 'Ramps.vue');
assertContains(page, 'endpoint="/api/bank/trpc/ramps.setWithdrawDestination"', 'Ramps.vue');
assertContains(page, "'ramps.offramp'", 'Ramps.vue');
assertAbsent(page, "mutate('bank', 'ramps.onramp'", 'Ramps.vue');
assertAbsent(page, 'Number(this.dest', 'Ramps.vue');
assertAbsent(page, 'parseFloat', 'Ramps.vue');
assertAbsent(page, 'parseInt', 'Ramps.vue');

var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(lang, 'withdrawDestTitle:', 'en.js');
assertContains(lang, 'withdrawDestSave:', 'en.js');
assertContains(lang, 'withdrawDestSaved:', 'en.js');

console.log('ramps-withdraw-dest.golden: ok');
