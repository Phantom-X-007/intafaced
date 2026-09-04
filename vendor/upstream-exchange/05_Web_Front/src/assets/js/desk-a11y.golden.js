/**
 * Golden tests for desk-a11y.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/desk-a11y.golden.js
 */
'use strict';

var fs = require('fs');
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
assert(ids.indexOf('focus-trap') >= 0, 'baseline includes focus-trap');

/* ── tabWrapIndex / shouldTrapTab (B4 focus trap) ─────────────────────── */
assert(a11y.tabWrapIndex(0, 0, false) === -1, 'empty list → -1');
assert(a11y.tabWrapIndex(0, 1, false) === 0, 'single Tab stays 0');
assert(a11y.tabWrapIndex(0, 1, true) === 0, 'single Shift+Tab stays 0');
assert(a11y.tabWrapIndex(0, 3, false) === 1, 'Tab 0→1');
assert(a11y.tabWrapIndex(2, 3, false) === 0, 'Tab last wraps to 0');
assert(a11y.tabWrapIndex(0, 3, true) === 2, 'Shift+Tab first wraps to last');
assert(a11y.tabWrapIndex(2, 3, true) === 1, 'Shift+Tab 2→1');
assert(a11y.shouldTrapTab(true, 2) === true, 'trap when open + focusables');
assert(a11y.shouldTrapTab(false, 2) === false, 'no trap when closed');
assert(a11y.shouldTrapTab(true, 0) === false, 'no trap with zero focusables');

/* ── remaining-SOT §12.3 — submit/cancel/high-risk ≥ 44 CSS px (N4) ───── */
function cssWindows(src, sel) {
  var out = [];
  var from = 0;
  for (;;) {
    var i = src.indexOf(sel, from);
    if (i < 0) break;
    out.push(src.slice(i, i + 900));
    from = i + sel.length;
  }
  return out;
}
function ruleBody(chunk) {
  var open = chunk.indexOf('{');
  if (open < 0) return '';
  var depth = 0;
  for (var i = open; i < chunk.length; i++) {
    if (chunk[i] === '{') depth += 1;
    else if (chunk[i] === '}') {
      depth -= 1;
      if (depth === 0) return chunk.slice(open, i + 1);
    }
  }
  return chunk.slice(open);
}
function someWindow(src, sel, re) {
  return cssWindows(src, sel).some(function (w) {
    return re.test(ruleBody(w));
  });
}
function minHeights(src, sel) {
  return cssWindows(src, sel)
    .map(function (w) {
      var m = ruleBody(w).match(/min-height:\s*(\d+)px/);
      return m ? Number(m[1]) : null;
    })
    .filter(function (n) {
      return n != null;
    });
}

var vueSrc = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var cssSrc = fs.readFileSync(path.join(__dirname, '../css/intafaced.css'), 'utf8');

assert(cssWindows(vueSrc, '.ix-submit').length > 0, 'Exchange.vue defines .ix-submit');
assert(
  someWindow(vueSrc, '.ix-submit', /min-height:\s*44px/),
  'Exchange.vue .ix-submit has min-height: 44px'
);
assert(
  someWindow(cssSrc, '.ix-submit', /min-height:\s*44px/),
  'intafaced.css .ix-submit has min-height: 44px'
);
assert(
  minHeights(vueSrc, '.ix-submit').every(function (n) {
    return n >= 44;
  }),
  'Exchange.vue .ix-submit min-heights are ≥ 44px'
);
assert(
  minHeights(cssSrc, '.ix-submit').every(function (n) {
    return n >= 44;
  }),
  'intafaced.css .ix-submit min-heights are ≥ 44px'
);
assert(
  someWindow(vueSrc, '.ix-cancel', /min-height:\s*44px/),
  'Exchange.vue .ix-cancel has min-height: 44px'
);
assert(
  someWindow(vueSrc, '.ix-mass-cancel', /min-height:\s*44px/),
  'Exchange.vue .ix-mass-cancel has min-height: 44px'
);
assert(
  !someWindow(vueSrc, '.ix-submit', /linear-gradient/),
  'Exchange.vue .ix-submit has no gradient'
);
assert(
  someWindow(vueSrc, '.ix-submit', /background:\s*var\(--ix-up/),
  'Exchange.vue .ix-submit buy fill is solid --ix-up'
);
assert(
  someWindow(vueSrc, '.ix-submit', /background:\s*var\(--ix-down/),
  'Exchange.vue .ix-submit sell fill is solid --ix-down'
);
assert(
  someWindow(vueSrc, '.ix-submit', /border-radius:\s*0/),
  'Exchange.vue .ix-submit is square'
);

if (failed) {
  console.error('\n' + failed + ' desk-a11y golden assertion(s) failed');
  process.exit(1);
}
console.log('\ndesk-a11y golden: all passed');
process.exit(0);
