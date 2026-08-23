/**
 * Fail-first: /invite shows the live affiliate fee-share configuration or a
 * named not-configured state. No client-side rate or money is invented.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/invite/Invite.vue'), 'utf8');

function mustHave(needle) {
  if (page.indexOf(needle) === -1) throw new Error('Invite.vue must contain ' + needle);
}

mustHave("query('trade', 'copy.deskStatus'");
mustHave('feeSharePublished !== true');
mustHave('leaderShareBps');
mustHave('feeShareUnset');
if (page.indexOf('10%') !== -1 || page.indexOf('0.10') !== -1) throw new Error('Invite.vue invents a fee-share rate');
if (page.indexOf('Number(') !== -1 || page.indexOf('parseFloat(') !== -1) throw new Error('Invite.vue coerces money to number');
if (page.indexOf('auto') !== -1 && page.indexOf('auto-place') !== -1) throw new Error('Invite.vue promises automatic placement');

console.log('ok: invite fee-share visibility is live-or-not-configured');
