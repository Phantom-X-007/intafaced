'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Pay.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('Pay.vue missing ' + needle);
}

assertContains(page, "mutate('pay', 'fraud.enqueueReview'");
assertContains(page, 'amount: this.form.amount');
assertContains(page, "draftId('fraudReview')");
if (page.indexOf('Number(') !== -1) throw new Error('amount must stay a string');
if (page.indexOf('parseFloat') !== -1) throw new Error('amount must stay a string');
if (page.indexOf('parseInt') !== -1) throw new Error('amount must stay a string');
if (page.indexOf("mutate('pay', 'fraud.listOpenReviews'") !== -1) {
  throw new Error('must not call listOpenReviews');
}
if (page.indexOf("mutate('pay', 'fraud.resolveReview'") !== -1) {
  throw new Error('must not call resolveReview');
}
console.log('pay-fraud-review.golden: ok');
