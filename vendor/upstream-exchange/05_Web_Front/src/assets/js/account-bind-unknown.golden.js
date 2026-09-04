'use strict';
/**
 * remaining-SOT: timeout/transport death on payment-method bind is unknown,
 * not save_failure. Dual HTTP leftover may stay vue-resource; honesty cannot.
 *
 * Run from 05_Web_Front: node src/assets/js/account-bind-unknown.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../components/uc/Account.vue'), 'utf8');

function assert(cond, name) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exit(1);
  }
  console.log('ok:', name);
}

var start = page.indexOf('postBind(url, param)');
var end = page.indexOf('submit(name)', start);
assert(start !== -1 && end !== -1 && end > start, 'postBind block found');
var bind = page.slice(start, end);
var catchBlock = bind.slice(bind.lastIndexOf('.catch'));
assert(catchBlock.indexOf('save_failure') === -1, 'postBind catch is not save_failure');
assert(bind.indexOf("uc.account.save_failure") !== -1, 'explicit service reject still save_failure');
assert(catchBlock.indexOf('unknown') !== -1, 'postBind catch names unknown');
assert(catchBlock.indexOf('bindUnknown') !== -1, 'durable bindUnknown state');
assert(bind.indexOf('done()') !== -1, 'lock released on unknown');
assert(page.indexOf('kind="unknown"') !== -1, 'unknown IxHonestState mounted');
assert(!/localStorage\.(?:getItem|setItem)\(['"](?:TOKEN|MEMBER)['"]/.test(page), 'no TOKEN/MEMBER persist');

var getCatch = page.slice(page.indexOf('getAccount()'), page.indexOf('created()'));
assert(getCatch.indexOf('unknown, not unbound') !== -1, 'getAccount catch stays unknown not unbound');

console.log('account-bind-unknown.golden: ok');
