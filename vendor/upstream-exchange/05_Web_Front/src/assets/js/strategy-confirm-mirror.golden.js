#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/market/StrategyListing.vue'), 'utf8');

function has(needle) {
  if (source.indexOf(needle) === -1) throw new Error('strategy-confirm-mirror.golden missing ' + needle);
}

has("mutate('trade', 'copy.planMirror'");
has("mutate('trade', 'copy.placeMirror'");
has('v-if="mirrorPlan"');
has('@click="confirmMirror"');
has('leaderPaper: null');
has('this.mirrorPlan = null');
if (/auto-mirror-place|autoMirrorPlace/.test(source)) {
  throw new Error('strategy-confirm-mirror.golden must remain user-confirmed, not auto-place');
}
if (/Number\s*\(|parseFloat\s*\(/.test(source)) {
  throw new Error('strategy-confirm-mirror.golden must not convert money to JS number');
}

console.log('strategy-confirm-mirror.golden: ok');
