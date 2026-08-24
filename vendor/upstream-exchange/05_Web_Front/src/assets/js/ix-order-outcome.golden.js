/* Pure command-outcome/state-transition goldens for the exchange desk. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var outcome = require('./ix-order-outcome.js');
var tradeWire = require('./ix-trade.js');

var replacementWire = tradeWire.toReplaceOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '0.000000000000000001',
  price: '12345.670000000000000001',
  timeInForce: 'GTC',
  clientOrderId: 'amend-stable-1'
});
assert.strictEqual(replacementWire.amount, '0.000000000000000001');
assert.strictEqual(replacementWire.price, '12345.670000000000000001');
assert.strictEqual(replacementWire.clientOrderId, 'amend-stable-1');

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

var replacementBody = outcome.classifyReplace({ ok: true, data: {
  accepted: true,
  code: 'REPLACED',
  originalOrderId: 'order-1',
  replacementOrderId: 'order-2'
} });
assert.strictEqual(replacementBody.kind, 'applied');

var replacementCancelUnknown = outcome.classifyReplace({ ok: true, data: {
  accepted: false,
  code: 'CANCEL_UNKNOWN',
  originalOrderId: 'order-1',
  reconciliationRequired: true
} });
assert.strictEqual(replacementCancelUnknown.state, 'CANCEL_UNKNOWN');

var replacementSubmitUnknown = outcome.classifyReplace({ ok: true, data: {
  accepted: false,
  code: 'REPLACEMENT_SUBMIT_UNKNOWN',
  replacementOrderId: 'order-2',
  reconciliationRequired: true
} });
assert.strictEqual(replacementSubmitUnknown.state, 'SUBMIT_UNKNOWN');

var replacementPartial = outcome.classifyReplace({ ok: true, data: {
  accepted: false,
  code: 'ORIGINAL_PARTIAL'
} });
assert.strictEqual(replacementPartial.kind, 'refused');
assert.strictEqual(replacementPartial.reasonCode, 'ORIGINAL_PARTIAL');

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
  'ix-outcome-banner',
  'POST',
  '/replace',
  'toReplaceOrderBody',
  'amendSagaCopy',
  'amendSubmitUnknownCopy'
].forEach(function (needle) {
  assert.notStrictEqual(page.indexOf(needle), -1, 'Exchange.vue missing ' + needle);
});
assert.notStrictEqual(trade.indexOf('function toReplaceOrderBody'), -1, 'ix-trade missing replacement body helper');
assert.notStrictEqual(classifier.indexOf('OUTCOME_UNKNOWN'), -1, 'classifier missing OUTCOME_UNKNOWN');
assert.notStrictEqual(classifier.indexOf('classifyReplace'), -1, 'classifier missing replacement outcomes');
['recoveryReason', 'executionOutcome', 'reconciliationKey'].forEach(function (needle) {
  assert.notStrictEqual(trade.indexOf(needle), -1, 'ix-trade missing ' + needle);
});
assert.ok(/const verdict = ixOrderOutcome\.classify\(res, 'submit'\)[\s\S]{0,900}if \(verdict\.kind === 'applied'\)/.test(page), 'submit success must follow outcome classification');

console.log('ix-order-outcome golden: PASS');
