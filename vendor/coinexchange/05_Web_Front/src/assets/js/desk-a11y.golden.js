/**
 * Golden tests for desk-a11y.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/desk-a11y.golden.js
 */
'use strict';

var path = require('path');
var a11y = require(path.join(__dirname, 'desk-a11y.js'));

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/* ── ticketErrorField ─────────────────────────────────────────────────── */
assert(a11y.ticketErrorField('') === 'general', 'empty → general');
assert(a11y.ticketErrorField('Enter an amount.') === 'amount', 'amount empty');
assert(
  a11y.ticketErrorField('Enter a valid amount greater than zero.') === 'amount',
  'amount invalid'
);
assert(a11y.ticketErrorField('Enter a limit price.') === 'price', 'limit price empty');
assert(
  a11y.ticketErrorField('Enter a valid limit price greater than zero.') === 'price',
  'limit price invalid'
);
assert(a11y.ticketErrorField('Price is too large.') === 'price', 'price too large');
assert(
  a11y.ticketErrorField('Scientific notation is not accepted — use a plain decimal.') === 'amount',
  'scientific → amount (both fields)'
);
assert(
  a11y.ticketErrorField('Insufficient balance. Available 1.00000000.') === 'general',
  'balance is general (not invent field)'
);
assert(
  a11y.ticketErrorField('Market feed is down — double-check size before confirming any order.') ===
    'general',
  'feed warning general'
);

/* ── buildTicketErrorSummary (GOV.UK) ─────────────────────────────────── */
assert(a11y.buildTicketErrorSummary('') === null, 'no summary when empty');
assert(a11y.buildTicketErrorSummary(null) === null, 'no summary when null');

var s = a11y.buildTicketErrorSummary('Enter an amount.');
assert(!!s && s.message === 'Enter an amount.', 'summary message matches field error verbatim');
assert(s.title === 'There is a problem', 'summary title fixed');
assert(s.id === a11y.TICKET_FIELD_IDS.summary, 'summary id stable');
assert(s.field === 'amount', 'summary field amount');
assert(s.fieldId === 'ix-ticket-amount', 'summary links amount id');
assert(s.href === '#ix-ticket-amount', 'summary href amount');

var sp = a11y.buildTicketErrorSummary('Enter a limit price.');
assert(sp.field === 'price' && sp.href === '#ix-ticket-price', 'summary links price');

var sg = a11y.buildTicketErrorSummary('This market is halted.');
assert(sg.field === 'general' && sg.href === null, 'general has no field href');

/* ── ticketFieldAria ──────────────────────────────────────────────────── */
var ariaAmt = a11y.ticketFieldAria('amount', 'Enter an amount.');
assert(ariaAmt['aria-invalid'] === 'true', 'amount invalid when amount error');
assert(
  ariaAmt['aria-describedby'] === a11y.TICKET_FIELD_IDS.summary,
  'amount describedby summary'
);
var ariaPriceOk = a11y.ticketFieldAria('price', 'Enter an amount.');
assert(ariaPriceOk['aria-invalid'] === 'false', 'price valid when amount error');
assert(ariaPriceOk['aria-describedby'] === undefined, 'price no describedby when not target');
var ariaClear = a11y.ticketFieldAria('amount', '');
assert(ariaClear['aria-invalid'] === 'false', 'cleared error → not invalid');

/* ── liveAnnounceUpdate (LiveAnnouncer clear-then-set) ────────────────── */
assert(
  a11y.liveAnnounceUpdate('', 'Hello').text === 'Hello' &&
    a11y.liveAnnounceUpdate('', 'Hello').needsClearFirst === false,
  'first announce set only'
);
assert(
  a11y.liveAnnounceUpdate('Hello', 'Hello').needsClearFirst === true &&
    a11y.liveAnnounceUpdate('Hello', 'Hello').text === 'Hello',
  'same text needs clear first'
);
assert(
  a11y.liveAnnounceUpdate('Hello', 'World').needsClearFirst === false &&
    a11y.liveAnnounceUpdate('Hello', 'World').text === 'World',
  'changed text set only'
);
assert(a11y.liveAnnounceUpdate('Hello', '').text === '', 'clear to empty');
assert(a11y.liveAnnounceUpdate(null, null).text === '', 'null → empty');

/* ── baseline checklist present ───────────────────────────────────────── */
assert(
  Array.isArray(a11y.DESK_A11Y_BASELINE) && a11y.DESK_A11Y_BASELINE.length >= 5,
  'baseline documented'
);
var ids = a11y.DESK_A11Y_BASELINE.map(function (x) {
  return x.id;
});
assert(ids.indexOf('error-summary') >= 0, 'baseline includes error-summary');
assert(ids.indexOf('live-announce') >= 0, 'baseline includes live-announce');
assert(ids.indexOf('focus-visible') >= 0, 'baseline includes focus-visible');

if (failed) {
  console.error('\n' + failed + ' desk-a11y golden assertion(s) failed');
  process.exit(1);
}
console.log('\ndesk-a11y golden: all passed');
process.exit(0);
