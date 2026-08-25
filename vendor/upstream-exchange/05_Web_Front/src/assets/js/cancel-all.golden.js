/* Focused goldens for the Bazaar desk's scoped cancel-all saga. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var outcome = require('./ix-order-outcome.js');

var pagePath = path.join(__dirname, '..', '..', 'pages', 'exchange', 'Exchange.vue');
var page = fs.readFileSync(pagePath, 'utf8');

/* Pair cancel-all hits matching mass-cancel through trade. All-markets stays
   sequential DELETE without a query. Trade never sends a session. */
assert.ok(
  /rest\('\/markets\/' \+ encodeURIComponent\(marketId\) \+ '\/orders\/mass-cancel', \{[\s\S]{0,220}method: 'POST'[\s\S]{0,220}body: \{\}/.test(page),
  'pair cancel-all must POST /markets/:marketId/orders/mass-cancel with an empty body'
);
assert.ok(page.indexOf('sessionId') === -1, 'mass-cancel must not send a session');
assert.ok(
  /rest\('\/orders', \{[\s\S]{0,200}method: 'DELETE'[\s\S]{0,200}query: undefined/.test(page),
  'all-markets cancel-all must reuse rest DELETE without a query'
);
assert.ok(page.indexOf('pairMarketId') !== -1, 'pair mass-cancel needs the listed market id');
assert.ok(page.indexOf("query: { symbol: this.currentCoin.symbol, limit: 500 }") !== -1, 'symbol open-order read must pin the 500-row cap');
assert.ok(page.indexOf("query: { limit: 500 }") !== -1, 'all-markets open-order read must pin the 500-row cap');
assert.ok(page.indexOf('rows.length === 500') !== -1, 'mass-cancel must refuse a capped snapshot');
assert.ok(page.indexOf('openOrders.length === 500') !== -1, 'symbol control must disable at the cap');
assert.ok(page.indexOf('allOpenOrders.length === 500') !== -1, 'all-markets control must disable at the cap');
assert.ok(page.indexOf("cancelAllOrders('symbol')") !== -1, 'symbol scope control missing');
assert.ok(page.indexOf("cancelAllOrders('all')") !== -1, 'all-markets scope control missing');
assert.ok(page.indexOf('allOpenOrdersReachable && allOpenOrders.length') !== -1, 'all-markets control must require a live read with rows');

var applied = outcome.classifyCancelAll({ ok: true, status: 200, data: [{ id: '1' }, { id: '2' }] });
assert.strictEqual(applied.kind, 'applied');
assert.strictEqual(applied.data.length, 2, '200 count comes from the returned list');
var noop = outcome.classifyCancelAll({ ok: true, status: 200, data: [] });
assert.strictEqual(noop.kind, 'applied');
assert.strictEqual(noop.data.length, 0, 'empty 200 is an honest no-op');

var pairApplied = outcome.classifyCancelAll({
  ok: true,
  status: 200,
  data: { accepted: true, accountId: 'desk', cancellations: [{ id: '1' }], rejected: null }
});
assert.strictEqual(pairApplied.kind, 'applied');
assert.strictEqual(pairApplied.data.length, 1, '200 count comes from matching cancellations');
var pairNoop = outcome.classifyCancelAll({
  ok: true,
  status: 200,
  data: { accepted: true, accountId: 'desk', cancellations: [], rejected: null }
});
assert.strictEqual(pairNoop.kind, 'applied');
assert.strictEqual(pairNoop.data.length, 0, 'empty matching cancellations is an honest no-op');
var sessionRefuse = outcome.classifyCancelAll({
  ok: true,
  status: 200,
  data: {
    accepted: false,
    accountId: 'desk',
    cancellations: [],
    rejected: { code: 'session_unsupported', message: 'session mass-cancel is unsupported; trade does not invent a session' }
  }
});
assert.strictEqual(sessionRefuse.kind, 'refused');
assert.strictEqual(sessionRefuse.reasonCode, 'session_unsupported');

var unauthorized = outcome.classifyCancelAll({ ok: false, status: 401, reason: 'unauthorized' });
assert.strictEqual(unauthorized.kind, 'refused');
assert.strictEqual(unauthorized.outcome, 'REFUSED');
var forbidden = outcome.classifyCancelAll({ ok: false, status: 403, reason: 'forbidden' });
assert.strictEqual(forbidden.kind, 'refused');

var servicePartial = outcome.classifyCancelAll({ ok: false, status: 500, reason: 'error', message: 'engine stopped' });
assert.strictEqual(servicePartial.kind, 'unknown');
assert.strictEqual(servicePartial.state, 'CANCEL_ALL_OUTCOME_UNKNOWN');
assert.strictEqual(servicePartial.reasonCode, 'CANCEL_ALL_PARTIAL');
var transportPartial = outcome.classifyCancelAll({ ok: false, status: 0, reason: 'unreachable' });
assert.strictEqual(transportPartial.kind, 'unknown');
assert.strictEqual(transportPartial.state, 'CANCEL_ALL_OUTCOME_UNKNOWN');

/* Target IDs and scope survive the durable pending-outcome path; the all
   scope uses a global key so changing symbols cannot discard reconciliation. */
[
  'targetOrderIds',
  'targetCount',
  'pendingOutcomeStorageKey(outcome)',
  "(outcome && outcome.symbol) || this.currentCoin.symbol",
  "outcome.scope === 'all'",
  'sessionStorage.setItem',
  'sessionStorage.removeItem'
].forEach(function (needle) {
  assert.notStrictEqual(page.indexOf(needle), -1, 'persistence missing ' + needle);
});

/* Reads must be successful and scope-matching; remaining targets stay
   unresolved, while deliberate individual row cancellation remains reachable. */
[
  'reconcileCancelAllOutcomeFromRows',
  'allOpenOrdersReachable',
  'openOrdersReachable',
  'remainingTargetOrderIds',
  "scope === 'symbol' && pending.symbol !== this.currentCoin.symbol",
  'isIndividualActionBlocked',
  'this.pendingOutcome.action !== \'cancel_all\''
].forEach(function (needle) {
  assert.notStrictEqual(page.indexOf(needle), -1, 'reconciliation missing ' + needle);
});

console.log('cancel-all golden: PASS');
