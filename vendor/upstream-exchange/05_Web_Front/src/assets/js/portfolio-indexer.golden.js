'use strict';
/**
 * Fail-first: /portfolio chain half is real indexer positions OR named
 * indexer.portfolio_positions_unwired — never $0 for a missing indexer.
 * Run from 05_Web_Front: node src/assets/js/portfolio-indexer.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Portfolio.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

var indexerCard = page.match(/id="ix-portfolio-indexer"[\s\S]*?<\/div>\s*<div class="ix-card">/);
assert(Boolean(indexerCard), 'dedicated indexer block ix-portfolio-indexer');
if (!indexerCard) {
  throw new Error('indexer block deleted');
}
var block = indexerCard[0];

assert(block.indexOf('IxState') !== -1, 'indexer block uses IxState');
assert(block.indexOf('reason="no_surface"') !== -1, 'named unwired via IxState no_surface');
assert(block.indexOf('indexerAbsent') !== -1, 'absent status branch');
assert(block.indexOf('indexerPositions') !== -1, 'present positions rows');
assert(block.indexOf('row.size') !== -1, 'size rendered as string field');
assert(block.indexOf('row.entryPrice') !== -1, 'entryPrice rendered as string field');
assert(block.indexOf('Number(') === -1, 'indexer amounts not Number()');
assert(block.indexOf('parseFloat') === -1, 'indexer amounts not parseFloat');
assert(block.indexOf('parseInt') === -1, 'indexer amounts not parseInt');
assert(block.indexOf('$0') === -1, 'missing chain half must not render $0');
assert(page.indexOf("query('ledger', 'portfolio'") !== -1, 'portfolio query still on ledger door');

assert(lang.indexOf('indexer.portfolio_positions_unwired') !== -1, 'en names unwired code');
assert(lang.indexOf('indexerEmpty:') !== -1, 'en empty-present copy');
assert(lang.indexOf('entryPrice:') !== -1, 'en entryPrice label');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('portfolio-indexer.golden: ok');
process.exit(0);
