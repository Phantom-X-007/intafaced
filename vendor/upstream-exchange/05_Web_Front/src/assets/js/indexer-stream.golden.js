'use strict';
/**
 * Fail-first: /chain projection stream — stream or indexer.stream_unwired.
 * Run from 05_Web_Front: node src/assets/js/indexer-stream.golden.js
 *
 * Empty stays empty. Venue ABI is not invented. Amounts stay strings.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Chain.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var stream = fs.readFileSync(
  path.join(__dirname, '../../../../../../services/svc-indexer/src/stream.ts'),
  'utf8',
);
var ws = fs.readFileSync(
  path.join(__dirname, '../../../../../../services/svc-ws/src/indexer-stream.ts'),
  'utf8',
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

assert(page.indexOf("query('indexer', 'stream'") !== -1, 'Chain.vue queries stream');
assert(page.indexOf('indexer.stream_unwired') !== -1 || lang.indexOf('indexer.stream_unwired') !== -1, 'names stream_unwired');
assert(page.indexOf('streamEmpty') !== -1, 'empty stays empty copy');
assert(page.indexOf('Number(') === -1, 'no Number() on Chain.vue');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on Chain.vue');
assert(page.indexOf('audited:true') === -1 && page.indexOf('audited: true') === -1, 'never audited:true');

assert(stream.indexOf('indexer.stream_unwired') !== -1, 'stream.ts named refuse');
assert(stream.indexOf('0x0000000000000000000000000000000000000000') !== -1, 'zero venue is unwired');
assert(stream.indexOf("type: 'delta'") !== -1, 'absolute delta shape');
assert(ws.indexOf('applyDelta') !== -1, 'svc-ws uses market-data applyDelta');
assert(ws.indexOf('indexer.stream_unwired') !== -1, 'ws names unwired');
assert(ws.indexOf('emptyBook') !== -1, 'ws does not invent a live zero');

assert(lang.indexOf('streamTitle:') !== -1, 'en.js streamTitle');
assert(lang.indexOf('indexer.stream_unwired') !== -1, 'en.js names stream_unwired');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('indexer-stream.golden: ok');
process.exit(0);
