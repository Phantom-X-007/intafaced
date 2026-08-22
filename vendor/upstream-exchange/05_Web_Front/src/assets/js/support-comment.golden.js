'use strict';

/**
 * /support leftover mutate comment — user thread only, no ops doors.
 * Run: node src/assets/js/support-comment.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Support.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(hay, needle, msg) {
  if (hay.indexOf(needle) === -1) throw new Error(msg || ('missing ' + needle));
}

function assertAbsent(hay, needle, msg) {
  if (hay.indexOf(needle) !== -1) throw new Error(msg || ('forbidden ' + needle));
}

assertContains(page, "mutate('support', 'comment'", 'comment mutate missing');
assertContains(page, "query('support', 'listComments'", 'listComments missing');
assertContains(page, '{ticketId, body}', 'comment input');
assertContains(page, 'pickTicket', 'pick ticket');
assertContains(page, 'intafaced.support.comment', 'Vue $t comment keys');
assertContains(page, 'intafaced.support.commentEmpty', 'empty comments must be copy, not a count');
assertContains(lang, 'commentOpen:');
assertContains(lang, 'commentPick:');
assertContains(lang, 'commentBody:');
assertContains(lang, 'commentSubmit:');
assertContains(lang, 'commented:');
assertContains(lang, 'commentEmpty:');
assertAbsent(page, "mutate('support', 'setStatus'");
assertAbsent(page, "mutate('support', 'escalate'");
assertAbsent(page, "mutate('support', 'claim'");
assertAbsent(page, "mutate('support', 'publishKb'");
if (/\{\{\s*comments\.data\.length\s*\}\}/.test(page) || /comments\.data\.length\s*===?\s*0/.test(page)) {
  throw new Error('empty comments must not render as 0');
}
console.log('support-comment.golden: ok');
