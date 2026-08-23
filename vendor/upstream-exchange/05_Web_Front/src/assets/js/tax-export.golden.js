'use strict';
/**
 * Fail-first: /portfolio tax card must call svc-tax and name the unmapped refuse.
 * Run from 05_Web_Front: node src/assets/js/tax-export.golden.js
 *
 * Caller selects FIFO|LIFO|HIFO. Blank owner jurisdiction map →
 * tax.jurisdiction_unmapped. Empty books are not a $0 PnL.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Portfolio.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle, name) {
  if (value.indexOf(needle) === -1) {
    throw new Error((name || 'missing') + ': ' + needle);
  }
}

var hasMutate = page.indexOf("mutate('tax'") !== -1;
var hasQuery = page.indexOf("query('tax'") !== -1;
if (!hasMutate && !hasQuery) {
  throw new Error("Portfolio.vue must call mutate('tax' or query('tax'");
}

assertContains(page, 'tax.jurisdiction_unmapped', 'unmapped refuse code');
assertContains(page, 'FIFO', 'FIFO method');
assertContains(page, 'LIFO', 'LIFO method');
assertContains(page, 'HIFO', 'HIFO method');
assertContains(page, 'IxState', 'named refuse surface');

assertContains(lang, 'intafaced: {', 'en catalog');
assertContains(lang, 'tax:', 'en intafaced.tax');
assertContains(lang, 'unmapped:', 'en unmapped copy');
assertContains(lang, 'exportPack:', 'en export label');

if (/\$0|0\.00 PnL|pnl:\s*0/i.test(page)) {
  throw new Error('empty books must not render as $0 PnL');
}

console.log('tax-export.golden: ok');
