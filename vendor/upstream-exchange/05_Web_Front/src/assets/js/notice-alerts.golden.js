'use strict';

/**
 * Fail-first: /notice createAlert mutate for funding + liquidation_proximity.
 * Run from 05_Web_Front: node src/assets/js/notice-alerts.golden.js
 *
 * Sourced-mark watches only. Dark/unpublished marks refuse — never fire on
 * an invented series. Whale/intelligence stay unpublished (no create option).
 * Target is a decimal string — never Number() / parseFloat.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/cms/Notice.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle, name) {
  if (value.indexOf(needle) === -1) {
    throw new Error((name || 'missing') + ': ' + needle);
  }
}

function assertAbsent(value, needle, name) {
  if (value.indexOf(needle) !== -1) {
    throw new Error((name || 'must not contain') + ': ' + needle);
  }
}

assertContains(page, "mutate('notify', 'notify.createAlert'", 'createAlert mutate');
assertContains(page, "query('notify', 'notify.alerts'", 'alerts list');
assertContains(page, 'kind: this.alertKind', 'kind from form');
assertContains(page, 'targetPrice: this.alertTargetPrice', 'decimal-string target');
assertContains(page, 'value="funding"', 'funding option');
assertContains(page, 'value="liquidation_proximity"', 'liq option');
assertContains(page, 'evaluation.canFire === false', 'dark refuse surface');
assertContains(page, 'createAlertAction.data.evaluation.code', 'named refuse code');

assertAbsent(page, 'value="whale"', 'Notice.vue');
assertAbsent(page, 'value="intelligence"', 'Notice.vue');
assertAbsent(page, 'parseFloat', 'Notice.vue');
assertAbsent(page, 'Number(this.alertTarget', 'Notice.vue');
assertAbsent(page, "kind: 'whale'", 'Notice.vue');
assertAbsent(page, "kind: 'intelligence'", 'Notice.vue');

assertContains(lang, 'alertsTitle:', 'en.js');
assertContains(lang, 'alertsCannotFire:', 'en.js');
assertContains(lang, 'alertsLead:', 'en.js');

console.log('notice-alerts.golden: ok');
