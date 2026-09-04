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
assert(bind.indexOf('uc.account.save_failure') !== -1, 'explicit service reject still save_failure');
assert(catchBlock.indexOf('unknown') !== -1, 'postBind catch names unknown');
assert(catchBlock.indexOf('bindUnknown') !== -1, 'durable bindUnknown state');
assert(catchBlock.indexOf('done()') !== -1, 'catch releases lock');
assert(catchBlock.indexOf("code === '4000'") !== -1 && catchBlock.indexOf("code === '3000'") !== -1, 'auth 4000/3000 is not unknown');
assert(catchBlock.indexOf('this.getAccount()') !== -1, 'unknown write reconciles via getAccount');
assert(bind.indexOf('this.bindSubmitting || this.bindUnknown') !== -1, 'retry blocked while unknown');
assert(page.indexOf('kind="unknown"') !== -1, 'unknown IxHonestState mounted');
assert(!/localStorage\.(?:getItem|setItem)\(['"](?:TOKEN|MEMBER)['"]/.test(page), 'no TOKEN/MEMBER persist');

var getStart = page.indexOf('getAccount() {');
var getEnd = page.indexOf('created()');
var getFn = page.slice(getStart, getEnd);
var getCatch = getFn.slice(getFn.lastIndexOf('.catch'));
assert(getCatch.indexOf('profileUnknown') !== -1, 'getAccount catch uses profileUnknown');
assert(getCatch.indexOf('kind="error"') === -1, 'getAccount catch is not error-kind copy');
assert(getFn.indexOf("this.bindUnknown = ''") !== -1, 'successful read clears bindUnknown');
assert(page.indexOf('v-else-if="profileUnknown"') !== -1, 'read unknown is kind=unknown');

console.log('account-bind-unknown.golden: ok');
