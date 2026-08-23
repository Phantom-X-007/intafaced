'use strict';
/**
 * Fail-first: /platform copies an iframe snippet for GET /api/widget/ramp.
 * Unset licence is ops.infra_licence_unset. No second pay stack.
 * Run from 05_Web_Front: node src/assets/js/platform-embed-ramp.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Platform.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var widget = fs.readFileSync(
  path.join(__dirname, '../../../../../../services/svc-edge/src/widget-ramp.ts'),
  'utf8',
);

function assertContains(value, needle, name) {
  if (value.indexOf(needle) === -1) {
    throw new Error((name || 'missing') + ': ' + needle);
  }
}

function assertAbsent(value, needle, name) {
  if (value.indexOf(needle) !== -1) {
    throw new Error((name || 'present') + ': ' + needle);
  }
}

assertContains(page, "mutate('identity', 'apiKeys.create'", 'keep the API-key card from Lane I');
assertContains(page, '/api/widget/ramp', 'Platform.vue embed snippet points at the widget route');
assertContains(page, '<iframe src="', 'Platform.vue copies an iframe snippet');
assertContains(page, "intafaced.infra.title", 'infra card title');
assertContains(page, "intafaced.infra.copy", 'copy snippet control');
assertContains(page, 'embedSnippet', 'computed snippet');
assertContains(page, 'copyEmbed', 'copy action');
assertContains(page, 'ops.infra_licence_unset', 'Platform.vue names the unset-licence refuse');
assertContains(page, "query('bank', 'ramps.programme'", 'Platform.vue reads existing ramps.programme');
assertContains(page, 'module-mixin', 'clone Pay.vue mixin');
assertContains(page, 'IxState', 'named refuse surface');
assertAbsent(page, 'parseFloat', 'Platform.vue amounts stay strings');
assertAbsent(page, 'parseInt', 'Platform.vue amounts stay strings');
if (/Number\s*\(\s*this\./.test(page)) {
  throw new Error('Platform.vue must not coerce amounts with Number()');
}

assertContains(lang, 'infra: {', 'en.js intafaced.infra');
assertContains(lang, 'ops.infra_licence_unset', 'en.js names the unset-licence refuse');
assertContains(lang, 'Copy snippet', 'en.js intafaced.infra.copy');

assertContains(widget, 'ops.infra_licence_unset', 'edge widget named refuse');
assertContains(widget, '/bank/ramps', 'iframe of existing ramps');
assertContains(widget, '/api/pay/checkout', 'iframe of existing pay checkout');
assertAbsent(widget, 'renderCheckoutPage', 'no second pay stack');
assertAbsent(widget, 'openCheckoutSession', 'no second pay stack');
if (/\bNumber\s*\(|parseFloat|parseInt/.test(widget)) {
  throw new Error('widget-ramp.ts must not coerce amounts');
}

var copy = require('../lang/en.js').intafaced.infra;
if (!copy || typeof copy !== 'object') throw new Error('en.js intafaced.infra must be an object');
['title', 'lead', 'copy', 'copied', 'licenceNote', 'snippetLead', 'previewTitle'].forEach(function (key) {
  if (!copy[key]) throw new Error('en.js missing intafaced.infra.' + key);
});

console.log('platform-embed-ramp.golden: ok');
