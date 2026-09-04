#!/usr/bin/env node
/**
 * Fail-first: /exchange copy mode mounts pause/stop/detach/flatten on copy.* only.
 * Never desk flatten / closePosition. Unwired flatten stays a named refuse.
 *
 * Run from 05_Web_Front: node src/assets/js/exchange-copy-controls.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var en = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assert(cond, name) {
  if (!cond) throw new Error('exchange-copy-controls.golden FAIL ' + name);
}

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('exchange-copy-controls.golden missing ' + needle);
}

function pane(src, startNeedle, endNeedle) {
  var start = src.indexOf(startNeedle);
  assert(start !== -1, 'pane start ' + startNeedle);
  var end = src.indexOf(endNeedle, start + startNeedle.length);
  assert(end !== -1, 'pane end ' + endNeedle);
  return src.slice(start, end);
}

var copyPane = pane(exchange, 'v-else-if="deskMode === \'copy\'"', '<template v-else>');
var controlFn = pane(exchange, 'copyControl(action, followId)', 'grantCopySession');

assertContains(copyPane, "copyControl('pause', row.followId)");
assertContains(copyPane, "copyControl('stop', row.followId)");
assertContains(copyPane, "copyControl('detach', row.followId)");
assertContains(copyPane, "copyControl('flatten', row.followId)");
assertContains(copyPane, 'intafaced.exchange.copy.pause');
assertContains(copyPane, 'intafaced.exchange.copy.stop');
assertContains(copyPane, 'intafaced.exchange.copy.detach');
assertContains(copyPane, 'intafaced.exchange.copy.flatten');
assertContains(copyPane, 'row.relationshipState');

assertContains(controlFn, "pause: 'copy.pause'");
assertContains(controlFn, "stop: 'copy.stop'");
assertContains(controlFn, "detach: 'copy.detach'");
assertContains(controlFn, "flatten: 'copy.flatten'");
assertContains(controlFn, "mutate('trade', procedure");
assert(controlFn.indexOf('closePosition') === -1, 'copyControl must not call closePosition');
assert(controlFn.indexOf("/positions/") === -1, 'copyControl must not DELETE /positions');
assert(copyPane.indexOf('closePosition') === -1, 'copy pane must not call desk closePosition');
assert(copyPane.indexOf("/positions/") === -1, 'copy pane must not desk-flatten via /positions');

assertContains(en, 'Flatten copy');
assertContains(en, 'trade.copy_flatten_refused');
assertContains(en, 'pause: "Pause"');
assertContains(en, 'stop: "Stop"');
assertContains(en, 'detach: "Detach"');

console.log('exchange-copy-controls.golden: ok');
