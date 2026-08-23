'use strict';
/**
 * Fail-first: strategy publish is market.createStrategyListing → createListing(subscription).
 * periodSeconds is set. Price stays a decimal string. No profit-share. No +% rank.
 * Run from 05_Web_Front: node src/assets/js/strategy-listing.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var card = fs.readFileSync(path.join(root, 'pages/intafaced/market/StrategyListing.vue'), 'utf8');
var mine = fs.readFileSync(path.join(root, 'pages/intafaced/market/Mine.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function mustHave(hay, needle, where) {
  if (hay.indexOf(needle) === -1) throw new Error(where + ' must contain ' + needle);
}
function mustNot(hay, needle, where) {
  if (hay.indexOf(needle) !== -1) throw new Error(where + ' must not contain ' + needle);
}

mustHave(card, "mutate('market', 'createStrategyListing'", 'StrategyListing.vue');
mustHave(card, 'periodSeconds: this.strategy.periodSeconds', 'StrategyListing.vue');
mustHave(card, 'price: this.strategy.price', 'StrategyListing.vue');
mustHave(card, '/api/market/trpc/createStrategyListing', 'StrategyListing.vue');
mustHave(card, 'IxState', 'StrategyListing.vue');
mustHave(card, 'ixModule', 'StrategyListing.vue');
mustHave(card, 'intafaced.quant.market', 'StrategyListing.vue');
mustHave(mine, 'StrategyListing.vue', 'Mine.vue');
mustHave(mine, 'IxStrategyListing', 'Mine.vue');

mustNot(card, "offerType: 'one_time'", 'StrategyListing.vue');
mustNot(card, 'profitShare', 'StrategyListing.vue');
mustNot(card, 'pnlFee', 'StrategyListing.vue');
mustNot(card, 'performanceFee', 'StrategyListing.vue');
mustNot(card, 'successFee', 'StrategyListing.vue');
mustNot(card, 'highWaterMark', 'StrategyListing.vue');
mustNot(card, 'rankByReturn', 'StrategyListing.vue');
mustNot(card, 'returnPct', 'StrategyListing.vue');
mustNot(card, 'parseFloat', 'StrategyListing.vue');
mustNot(card, 'parseInt', 'StrategyListing.vue');
mustNot(card, 'type="number"', 'StrategyListing.vue');
if (/\bfetch\s*\(/.test(card)) throw new Error('shell must not post; mutate is the only write');
if (/Number\s*\(\s*this\.strategy\.price/.test(card)) throw new Error('price must stay a decimal string');
if (card.indexOf('+%') !== -1) throw new Error('no +% rank on the strategy card');
if (card.indexOf('%') !== -1) throw new Error('strategy card must not show a percent rank');

mustHave(lang, 'quant: {', 'en.js');
mustHave(lang, 'periodUnset:', 'en.js');
mustHave(lang, 'noRank:', 'en.js');

var copy = require('../lang/en.js').intafaced.quant.market;
if (!copy || typeof copy !== 'object') throw new Error('en.js intafaced.quant.market must be an object');
['title', 'lead', 'listingTitle', 'period', 'periodUnset', 'periodDay', 'periodWeek', 'periodHint', 'publish', 'published', 'priceHint', 'noRank'].forEach(function (key) {
  if (!copy[key]) throw new Error('en.js missing intafaced.quant.market.' + key);
  if (String(copy[key]).indexOf('%') !== -1) throw new Error('en.js intafaced.quant.market.' + key + ' contains %');
  if (String(copy[key]).indexOf('+') !== -1) throw new Error('en.js intafaced.quant.market.' + key + ' contains + rank');
});

console.log('strategy-listing.golden: ok');
