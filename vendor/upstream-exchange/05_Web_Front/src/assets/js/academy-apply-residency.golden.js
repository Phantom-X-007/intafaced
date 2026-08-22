'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/academy/Curriculum.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("mutate('academy', 'applyResidency'") === -1) throw new Error('applyResidency mutate missing');
if (page.indexOf("mutate('academy', 'withdrawResidency'") === -1) throw new Error('withdrawResidency mutate missing');
if (page.indexOf("query('academy', 'myResidencies'") === -1) throw new Error('myResidencies query missing');
if (page.indexOf('cohortSlug') === -1) throw new Error('cohortSlug missing');
if (page.indexOf('statement') === -1) throw new Error('statement missing');
if (page.indexOf("mutate('academy', 'markCurriculumComplete'") === -1) {
  throw new Error('curriculum complete must stay');
}
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist residency in localStorage');
if (page.indexOf('ambassadorIfcPay') !== -1) throw new Error('must not invent residency pay');
if (page.indexOf('residencyIfcPay') !== -1) throw new Error('must not invent residency pay');
if (en.indexOf('residencyLead') === -1) throw new Error('residencyLead i18n missing');
if (en.indexOf('residencyApply') === -1) throw new Error('residencyApply i18n missing');
if (en.indexOf('residencyWithdraw') === -1) throw new Error('residencyWithdraw i18n missing');
if (en.indexOf('residencySignIn') === -1) throw new Error('residencySignIn i18n missing');
if (en.indexOf('residencyApplied') === -1) throw new Error('residencyApplied i18n missing');

console.log('academy-apply-residency.golden: ok');
