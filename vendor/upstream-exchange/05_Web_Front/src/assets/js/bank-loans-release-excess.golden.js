'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/bank/Loans.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || 'bank loans release excess') + ' missing ' + needle);
}

assertContains(page, "mutate('bank', 'loans.releaseExcess'");
assertContains(page, '{ loanId: this.managed.id, amount: this.releaseExcessAmount }');
assertContains(page, "endpoint=\"/api/bank/trpc/loans.releaseExcess\"");
assertContains(page, 'excessReleased.data.ledgerTxId');
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseInt(') !== -1) throw new Error('money converted to number');
if (page.indexOf("reason === 'bank.") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}

assertContains(en, 'releaseExcess:', 'en.js');
assertContains(en, 'releaseExcessAmount:', 'en.js');
assertContains(en, 'releaseExcessDone:', 'en.js');

console.log('bank-loans-release-excess.golden: ok');
