/**
 * Golden tests for desk-prefs.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/desk-prefs.golden.js
 */
'use strict';

var path = require('path');
var prefs = require(path.join(__dirname, 'desk-prefs.js'));

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(prefs.clampPanelWidth('markets', 100) === 160, 'markets floor 160');
assert(prefs.clampPanelWidth('markets', 999) === 320, 'markets ceiling 320');
assert(prefs.clampPanelWidth('markets', 200) === 200, 'markets mid ok');
assert(prefs.clampPanelWidth('rail', 50) === 200, 'rail floor');
assert(prefs.clampPanelWidth('order', 500) === 400, 'order ceiling');
assert(prefs.clampPanelWidth('nope', 1) === 0, 'unknown key → 0');

var n = prefs.normalizePanelWidths(null);
assert(n.markets === 208 && n.rail === 252 && n.order === 296, 'defaults when null');
var n2 = prefs.normalizePanelWidths({ markets: 50, rail: 'bogus', order: 300 });
assert(n2.markets === 160 && n2.rail === 252 && n2.order === 300, 'bad values clamped');

assert(prefs.panelWidthAfterDrag('markets', 208, 40) === 248, 'drag right grows markets');
assert(prefs.panelWidthAfterDrag('markets', 208, -100) === 160, 'drag left clamps floor');
assert(prefs.panelWidthAfterDrag('order', 296, 200) === 400, 'drag clamps ceiling');

var g = prefs.deskGridTemplate({ markets: 200, rail: 260, order: 300 });
assert(
  g === '200px 6px minmax(0, 1fr) 6px 260px 6px 300px',
  'grid template string'
);

if (failed) {
  console.error('\n' + failed + ' desk-prefs golden assertion(s) failed');
  process.exit(1);
}
console.log('\ndesk-prefs golden: all passed');
process.exit(0);
