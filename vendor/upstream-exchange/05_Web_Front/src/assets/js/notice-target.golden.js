'use strict';

/**
 * Fail-first lock for /notice register-target.
 * Run from 05_Web_Front: node src/assets/js/notice-target.golden.js
 *
 * registerTarget reports sent|refused|failed on the wire. Transport ok is not
 * a green tick — refused with channel.not_configured must render the code.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/cms/Notice.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('notice register target missing ' + needle);
}

assertContains(page, "mutate('notify', 'notify.registerTarget'");
assertContains(page, 'channel');
assertContains(page, 'address');
assertContains(page, "status === 'sent'");
assertContains(page, "status === 'refused'");
assertContains(page, "status === 'failed'");
assertContains(page, 'registerAction.data.code');

if (page.indexOf('notify.channelsPolicy') !== -1) throw new Error('must not call admin channelsPolicy');
if (page.indexOf("mutate('notify', 'notify.operator") !== -1) {
  throw new Error('must not call admin notify procedures');
}
if (/registerAction\.reason\s*===\s*['"]ok['"]/.test(page)) {
  throw new Error('must not treat transport ok as sent');
}
if (page.indexOf('ix-note-success') !== -1 || page.indexOf('ix-done') !== -1) {
  throw new Error('must not paint a green tick over registerTarget');
}

console.log('notice-target.golden: ok');
