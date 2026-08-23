'use strict';
/**
 * Fail-first: /ops four cards must call svc-ops and name warehouse/payroll refuses.
 * Run from 05_Web_Front: node src/assets/js/ops-business.golden.js
 *
 * Click: add a contact; see revenue or ops.warehouse_unwired; create a project.
 * Empty is not fake revenue. Team directory — no payroll invent.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Ops.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var routes = fs.readFileSync(path.join(__dirname, '../../config/routes.js'), 'utf8');

function assertContains(value, needle, name) {
  if (value.indexOf(needle) === -1) {
    throw new Error((name || 'missing') + ': ' + needle);
  }
}

assertContains(page, "query('ops', 'contacts'", 'contacts query');
assertContains(page, "query('ops', 'revenue'", 'revenue query');
assertContains(page, "mutate('ops', 'projects.create'", 'projects.create mutate');
assertContains(page, 'ops.warehouse_unwired', 'warehouse refuse code');
assertContains(page, 'ops.payroll_invent_forbidden', 'payroll refuse code');
assertContains(page, 'IxState', 'named refuse surface');
assertContains(page, "mutate('ops', 'createContact'", 'add contact');

assertContains(routes, "path: '/ops'", '/ops route');
assertContains(routes, 'pages/intafaced/Ops', 'Ops.vue route target');

assertContains(lang, 'intafaced: {', 'en catalog');
assertContains(lang, 'ops:', 'en intafaced.ops');
assertContains(lang, 'biz:', 'en intafaced.ops.biz');
assertContains(lang, 'warehouseUnwired:', 'en warehouse copy');
assertContains(lang, 'payrollForbidden:', 'en payroll copy');

if (/\$0|fake revenue|0\.00 revenue/i.test(page)) {
  throw new Error('empty warehouse must not render as fake $0 revenue');
}

console.log('ops-business.golden: ok');
