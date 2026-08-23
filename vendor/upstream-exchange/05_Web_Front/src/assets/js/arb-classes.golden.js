#!/usr/bin/env node
/**
 * Fail-first: arb class page lists class + refuse reason, never fake bps.
 * Run from 05_Web_Front: node src/assets/js/arb-classes.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('arb-classes.golden missing ' + needle);
}
function assertAbsent(value, needle) {
  if (value.indexOf(needle) !== -1) throw new Error('arb-classes.golden must not contain ' + needle);
}

var page = fs.readFileSync(path.join(root, 'pages/intafaced/execution/Arb.vue'), 'utf8');
assertContains(page, "mutate(");
assertContains(page, "'execution'");
assertContains(page, "'execution.oms.arb.scan'");
assertContains(page, 'quotes: []');
assertContains(page, 'scanClass: this.scanClass');
assertContains(page, 'triangular');
assertContains(page, 'basis');
assertContains(page, 'funding');
assertContains(page, 'row.reason');
assertAbsent(page, 'parseFloat');
assertAbsent(page, 'fake bps');

var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
assertContains(routes, "path: '/execution'");
assertContains(routes, 'pages/intafaced/execution/Arb');

var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
assertContains(en, 'never invents a spread');

console.log('arb-classes.golden: ok');
