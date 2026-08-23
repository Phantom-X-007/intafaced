'use strict';

var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, 'Setting.vue'), 'utf8');

[
  'perpLeverageCapDraft',
  'loadPerpListingPolicy',
  'savePerpLeverageCap',
  "fetch('/api/v1/markets'",
  "fetch('/api/trade/trpc/futures.policy'",
  'trade.leverage_cap_unset',
  'emptyPotBlocksLiveList',
  'targetSize',
  'live cap mutation is not mounted',
].forEach(function(marker) {
  if (source.indexOf(marker) === -1) throw new Error('C2 admin setting missing ' + marker);
});

if (/perpLeverageCapDraft\s*:\s*['\"]10['\"]/.test(source)) {
  throw new Error('C2 admin setting must not default leverage to 10x');
}
var saveStart = source.indexOf('savePerpLeverageCap()');
var saveEnd = source.indexOf('loadPerpListingPolicy()', saveStart);
var save = source.slice(saveStart, saveEnd);
if (save.indexOf("if (!cap)") === -1 || save.indexOf('trade.leverage_cap_unset') === -1) {
  throw new Error('C2 blank cap must refuse before any save');
}
if (save.indexOf('fetch(') !== -1) throw new Error('C2 must not call a nonexistent cap mutation');

console.log('perp-listing-setting golden: PASS');
