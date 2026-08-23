/**
 * Fail-first: in-app campaign draft via existing agents.growth.
 * Draft write is mutate('agents', 'growth.propose'). Outbound email/push/SMS
 * named-refuse channel.not_configured. No performance percent.
 * Run from 05_Web_Front: node src/assets/js/campaign-draft.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Agents.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../../assets/lang/en.js'), 'utf8');

function mustHave(hay, needle, where) {
  if (hay.indexOf(needle) === -1) {
    throw new Error(where + ' must contain ' + needle);
  }
}

function mustNot(hay, needle, where) {
  if (hay.indexOf(needle) !== -1) {
    throw new Error(where + ' must not contain ' + needle);
  }
}

mustHave(page, 'growth.propose', 'Agents.vue');
mustHave(page, "mutate('agents', 'growth.propose'", 'Agents.vue');
mustHave(page, 'intafaced.marketing.', 'Agents.vue');
mustHave(page, 'channel.not_configured', 'Agents.vue');
mustHave(page, 'outboundChannel', 'Agents.vue');
mustHave(page, 'checkOutbound', 'Agents.vue');
mustHave(page, "query('notify', 'notify.channels'", 'Agents.vue');
mustHave(page, 'value="email"', 'Agents.vue');
mustHave(page, 'value="push"', 'Agents.vue');
mustHave(page, 'value="sms"', 'Agents.vue');
mustHave(page, 'IxState', 'Agents.vue');
mustHave(page, 'ixModule', 'Agents.vue');

mustNot(page, "query('agents', 'growth.propose'", 'Agents.vue');
mustNot(page, 'publish: true', 'Agents.vue');
mustNot(page, 'incentiveBudget', 'Agents.vue');
mustNot(page, 'spendAmount', 'Agents.vue');
mustNot(page, 'notify.channelsPolicy', 'Agents.vue');
mustNot(page, "mutate('notify', 'notify.operator", 'Agents.vue');
mustNot(page, 'returnPct', 'Agents.vue');
mustNot(page, 'performanceFee', 'Agents.vue');
if (/\bfetch\s*\(/.test(page)) throw new Error('shell must not post; mutate is the only write');

mustHave(lang, 'marketing: {', 'en.js');

var copy = require('../lang/en.js').intafaced.marketing;
if (!copy || typeof copy !== 'object') {
  throw new Error('en.js intafaced.marketing must be an object');
}
['title', 'lead', 'headline', 'run', 'proposal', 'outbound', 'outboundLead', 'outboundRun', 'outboundRefused', 'attribution'].forEach(
  function (key) {
    if (!copy[key]) {
      throw new Error('en.js missing intafaced.marketing.' + key);
    }
  }
);

function walkCopy(node, here) {
  Object.keys(node).forEach(function (key) {
    var value = node[key];
    var pathHere = here + '.' + key;
    if (value && typeof value === 'object') {
      walkCopy(value, pathHere);
      return;
    }
    var text = String(value);
    if (text.indexOf('%') !== -1) {
      throw new Error('en.js ' + pathHere + ' contains %');
    }
    ['roi', 'APY', 'APR', 'returns-ranked', 'curve-fit', 'performance'].forEach(function (bad) {
      if (text.toLowerCase().indexOf(bad.toLowerCase()) !== -1) {
        throw new Error('en.js ' + pathHere + ' contains ' + bad);
      }
    });
  });
}
walkCopy(copy, 'intafaced.marketing');

console.log('campaign-draft.golden: ok');
