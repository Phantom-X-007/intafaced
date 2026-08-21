'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Agents.vue'), 'utf8');
var en = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('Agents copy missing ' + needle);
}

assertContains(page, 'copyIntel.runSession');
assertContains(page, "mutate('agents', 'copyIntel.runSession'");
assertContains(page, "copyPlane: 'dark'");
assertContains(page, 'fixtures: []');
assertContains(en, 'copy:');

if (page.indexOf("query('agents', 'copyIntel.runSession'") !== -1) {
  throw new Error('copyIntel.runSession is a mutate on tip, not a query');
}
if (page.indexOf('rankBy') !== -1) {
  throw new Error('must not send rankBy');
}
if (page.indexOf("sortBy: 'pnl'") !== -1 || page.indexOf('sortBy: "pnl"') !== -1) {
  throw new Error('must not returns-rank');
}
if (page.indexOf('rankedByReturns: true') !== -1) {
  throw new Error('must not paint a returns-ranked board');
}
if (/mutate\('agents', 'copyIntel\.runSession'[\s\S]{0,400}realisedPnl:\s*'[^']+'/.test(page)) {
  throw new Error('must not invent live-leader PnL');
}

console.log('agents-copy.golden: ok');
