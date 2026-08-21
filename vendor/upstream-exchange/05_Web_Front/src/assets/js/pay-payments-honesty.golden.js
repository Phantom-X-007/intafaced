#!/usr/bin/env node
/**
 * Honesty lock for pay/Payments.vue.
 * Run from 05_Web_Front: node src/assets/js/pay-payments-honesty.golden.js
 *
 * Two things this screen must not lie about:
 * 1. payment.create amount as string — the form value, never Number/parseFloat.
 * 2. railIds unused unless health.reason==='ok' — refused/unloaded health is
 *    not "zero rails". IxState names the reason; the picker is not painted.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(
  path.join(__dirname, '../../pages/intafaced/pay/Payments.vue'),
  'utf8'
);

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

assert(page.indexOf("mutate('pay', 'payment.create'") !== -1, 'payment.create mutate present');

var createBlock = page.match(/submitPayment\(\)\s*\{[\s\S]*?\n    \}/);
assert(Boolean(createBlock), 'submitPayment present');
if (createBlock) {
  var body = createBlock[0];
  assert(/amount:\s*this\.form\.amount/.test(body), 'payment.create amount as string');
  assert(body.indexOf('Number(') === -1, 'payment.create amount not Number()');
  assert(body.indexOf('parseFloat') === -1, 'payment.create amount not parseFloat');
  assert(body.indexOf('parseInt') === -1, 'payment.create amount not parseInt');
  assert(body.indexOf('+this.form.amount') === -1, 'payment.create amount not unary-plus');
}

var railIds = page.match(/railIds\(\)\s*\{[\s\S]*?\n    \},/);
assert(Boolean(railIds), 'railIds computed present');
if (railIds) {
  var r = railIds[0];
  assert(
    /this\.health\.reason\s*!==\s*['"]ok['"]/.test(r) || /this\.health\.reason\s*===\s*['"]ok['"]/.test(r),
    'railIds unused unless health.reason===ok'
  );
}

assert(
  page.indexOf('endpoint="/api/pay/trpc/health"') !== -1,
  'health IxState names refused/unloaded rails'
);

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('pay-payments-honesty.golden: ok');
process.exit(0);
