'use strict';
/**
 * Fail-first: /mining exposes the existing pool share door without inventing
 * hashrate, reward rates, epochs, or balances.
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var routes = fs.readFileSync(path.join(root, 'config/routes.js'), 'utf8');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Mining.vue'), 'utf8');

function mustHave(hay, needle, where) {
  if (hay.indexOf(needle) === -1) throw new Error(where + ' must contain ' + needle);
}

mustHave(routes, "path: '/mining'", 'routes.js');
mustHave(routes, 'pages/intafaced/Mining', 'routes.js');
mustHave(page, '/api/mining/submitShare', 'Mining.vue');
mustHave(page, 'mining.epoch_unset', 'Mining.vue');

if (/fake|mock|estimated hashrate|hashrate:\s*['\"0-9]/i.test(page)) {
  throw new Error('Mining.vue must not invent hashrate');
}
if (/rewardRate|expectedReward|dailyYield|annualYield/.test(page)) {
  throw new Error('Mining.vue must not invent pool returns');
}

console.log('mining-pool.golden: ok');
