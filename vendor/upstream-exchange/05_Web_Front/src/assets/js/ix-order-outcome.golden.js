/* Pure command-outcome/state-transition goldens for the exchange desk. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var outcome = require('./ix-order-outcome.js');

var unknownSubmit = outcome.classify({ ok: false, reason: 'unreachable', status: 0 }, 'submit');
assert.strictEqual(unknownSubmit.outcome, 'OUTCOME_UNKNOWN');
assert.strictEqual(unknownSubmit.state, 'SUBMIT_UNKNOWN');

var unknownCancel = outcome.classify({ ok: true, data: {
  recoveryReason: 'CANCEL_UNKNOWN',
  reconciliationKey: 'trade.order.reconcile:order-1:CANCEL_UNKNOWN',
  executionOutcome: { outcome: 'OUTCOME_UNKNOWN', state: 'RECONCILING', reasonCode: 'CANCEL_UNKNOWN', reconciliationKey: 'trade.order.reconcile:order-1:CANCEL_UNKNOWN' }
} }, 'cancel');
assert.strictEqual(unknownCancel.state, 'CANCEL_UNKNOWN');
assert.strictEqual(unknownCancel.reconciliationKey, 'trade.order.reconcile:order-1:CANCEL_UNKNOWN');

var refused = outcome.classify({ ok: false, reason: 'forbidden', status: 403, message: 'No scope' }, 'submit');
assert.strictEqual(refused.outcome, 'REFUSED');

var state = outcome.transition(null, { type: 'submit_requested', clientOrderId: 'desk-attempt-1' });
state = outcome.transition(state, { type: 'command_result', action: 'submit', result: { ok: false, reason: 'unreachable', status: 0 } });
assert.strictEqual(state.phase, 'unknown');
state = outcome.transition(state, { type: 'reconcile_requested' });
assert.strictEqual(state.phase, 'reconciling');
state = outcome.transition(state, { type: 'reconciliation_row', row: { status: 'TRADING', recoveryReason: null } });
assert.strictEqual(state.phase, 'resolved');

var root = path.join(__dirname, '..', '..', 'pages', 'exchange');
var page = fs.readFileSync(path.join(root, 'Exchange.vue'), 'utf8');
var trade = fs.readFileSync(path.join(__dirname, 'ix-trade.js'), 'utf8');
var classifier = fs.readFileSync(path.join(__dirname, 'ix-order-outcome.js'), 'utf8');
[
  'pendingOutcome',
  'reconcilePendingOutcome',
  'clientOrderId',
  'outcomeLabel(row)',
  'exchange.residual.reconcileNow',
  'ix-outcome-banner'
].forEach(function (needle) {
  assert.notStrictEqual(page.indexOf(needle), -1, 'Exchange.vue missing ' + needle);
});
assert.notStrictEqual(classifier.indexOf('OUTCOME_UNKNOWN'), -1, 'classifier missing OUTCOME_UNKNOWN');
['recoveryReason', 'executionOutcome', 'reconciliationKey'].forEach(function (needle) {
  assert.notStrictEqual(trade.indexOf(needle), -1, 'ix-trade missing ' + needle);
});
assert.ok(/const verdict = ixOrderOutcome\.classify\(res, 'submit'\)[\s\S]{0,900}if \(verdict\.kind === 'applied'\)/.test(page), 'submit success must follow outcome classification');

console.log('ix-order-outcome golden: PASS');
