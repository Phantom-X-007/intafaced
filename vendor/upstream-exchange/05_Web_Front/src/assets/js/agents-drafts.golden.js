'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Agents.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('Agents drafts missing ' + needle);
}

assertContains(page, 'growth.propose');
assertContains(page, 'draftScreening');
assertContains(page, "mutate('agents', 'growth.propose'");
assertContains(page, "query('agents', 'riskCompliance.draftScreening'");
if (page.indexOf('publish: true') !== -1) throw new Error('must not send publish');
if (page.indexOf('writeReviewedBy: true') !== -1) throw new Error('must not send writeReviewedBy');
if (page.indexOf('asDecision: true') !== -1) throw new Error('must not send asDecision');
if (page.indexOf('incentiveBudget') !== -1) throw new Error('must not send incentiveBudget');
console.log('agents-drafts.golden: ok');
