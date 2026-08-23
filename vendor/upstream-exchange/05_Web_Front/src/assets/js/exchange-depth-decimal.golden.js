#!/usr/bin/env node
/**
 * Fail-first: /exchange depth never IEEE-floats price/qty, and empty ≠ 0.
 * IxState names loading/refuse; an answered empty book stays empty.
 *
 * Run from 05_Web_Front: node src/assets/js/exchange-depth-decimal.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/exchange/Exchange.vue'), 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

function fnBody(src, name) {
  var re = new RegExp(name + '\\(\\)\\s*\\{');
  var m = src.match(re);
  if (!m) {
    /* methods may take args */
    re = new RegExp(name + '\\([^)]*\\)\\s*\\{');
    m = src.match(re);
  }
  if (!m) return '';
  var start = m.index + m[0].length - 1;
  var i = start;
  var depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

assert(page.indexOf('import IxState from') !== -1, 'IxState imported');
assert(page.indexOf('bookStateNamed') !== -1, 'bookStateNamed computed');
assert(page.indexOf(':reason="bookReason"') !== -1, 'bookReason passed to IxState');
assert(page.indexOf(':loading="bookLoading"') !== -1, 'bookLoading passed to IxState');
assert(page.indexOf(':endpoint="bookEndpoint"') !== -1, 'orderbook endpoint named on IxState');
assert(page.indexOf("bookReason = 'ok'") !== -1, 'answered book is reason ok (empty included)');
assert(page.indexOf("bookReason = res.reason") !== -1 || page.indexOf('bookReason = res.reason ||') !== -1, 'refuse reason is the rest reason');
assert(page.indexOf("gate.reason || 'invalid_response'") !== -1, 'shape fail is invalid_response not empty');

/* Empty totals are null, never a money 0. */
assert(page.indexOf('askTotal: null, bidTotal: null') !== -1, 'initial / reset plate totals are null');
assert(/askTotal:\s*0/.test(page) === false, 'no askTotal: 0');
assert(/bidTotal:\s*0/.test(page) === false, 'no bidTotal: 0');
assert(page.indexOf("askTotal: '0'") === -1 && page.indexOf('askTotal: "0"') === -1, "no askTotal: '0'");
assert(page.indexOf("bidTotal: '0'") === -1 && page.indexOf('bidTotal: "0"') === -1, "no bidTotal: '0'");

var apply = fnBody(page, 'applyPlate');
assert(apply.indexOf('normalizePlateLevels') !== -1, 'applyPlate uses honesty normalizer');
assert(/totalAmount : null/.test(apply) || apply.indexOf(': null') !== -1, 'empty applyPlate total is null');
assert(apply.indexOf("'0'") === -1 && apply.indexOf('"0"') === -1, 'applyPlate does not write string zero total');

var spread = fnBody(page, 'spread');
assert(spread.indexOf('ixMoney.subtract') !== -1, 'spread subtracts decimal strings');
assert(spread.indexOf('this.num(') === -1, 'spread does not this.num(price)');
assert(spread.indexOf('Number(') === -1, 'spread does not Number(price)');
assert(spread.indexOf('parseFloat') === -1, 'spread does not parseFloat price');
assert(spread.indexOf('bestAsk - bestBid') === -1, 'spread is not float minus');

var use = fnBody(page, 'useBookPrice');
assert(use.indexOf('bookPriceForForm') !== -1, 'click uses bookPriceForForm');
assert(use.indexOf('parseFloat') === -1, 'useBookPrice no parseFloat');
assert(use.indexOf('Number(') === -1, 'useBookPrice no Number(');

/* Depth template: no Number/parseFloat/unary-plus on price/qty. */
var template = page.split('<script>')[0];
var live = stripComments(template + apply + spread + use + fnBody(page, 'getPlate') + fnBody(page, 'startDepthFeed'));
assert(/Number\s*\(\s*(row|item)?\.?(price|amount|qty|totalAmount)/.test(live) === false, 'no Number( on price/qty');
assert(/parseFloat\s*\(\s*(row|item)?\.?(price|amount|qty)/.test(live) === false, 'no parseFloat on price/qty');
assert(live.indexOf('+row.price') === -1 && live.indexOf('+row.amount') === -1, 'no unary-plus on row money');
assert(live.indexOf("v-if=\"bookStateNamed\"") !== -1 || live.indexOf(':reason="bookReason"') !== -1, 'IxState gates named refuse');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('exchange-depth-decimal.golden: ok');
process.exit(0);
