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

var nativeBody = tradeWire.toAmendOrderBody({
  amount: '0.000000000000000001',
  price: '12345.670000000000000001',
  side: 'BUY'
});
assert.strictEqual(nativeBody.amount, '0.000000000000000001');
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeBody, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeBody, 'side'), false);

var resting = {
  orderId: 'order-1',
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  direction: 'BUY',
  price: '100.10',
  amount: '2.5',
  tif: 'GTC'
};
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'NATIVE_AMEND');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '2.50', price: '100.10', timeInForce: 'GTC'
}), 'NATIVE_AMEND');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.11', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'SELL', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'ETH/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'IOC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '3', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'MARKET_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC', postOnly: true
}), 'CANCEL_REPLACE');

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

var replacementTransportUnknown = outcome.classifyReplace({
  ok: false,
  reason: 'unreachable',
  status: 0,
  message: 'connection closed'
});
assert.strictEqual(replacementTransportUnknown.kind, 'unknown');
assert.strictEqual(replacementTransportUnknown.state, 'RECONCILING');
assert.strictEqual(replacementTransportUnknown.reasonCode, 'REPLACE_OUTCOME_UNKNOWN');

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

var nativeRetained = outcome.classifyAmend({ ok: true, data: {
  accepted: true,
  code: 'AMENDED',
  path: 'NATIVE_AMEND',
  priority: 'retained',
  orderId: 'order-1'
} });
assert.strictEqual(nativeRetained.kind, 'applied');
assert.strictEqual(nativeRetained.priority, 'retained');
assert.strictEqual(nativeRetained.path, 'NATIVE_AMEND');

var nativeLost = outcome.classifyAmend({ ok: true, data: {
  accepted: true,
  code: 'AMENDED',
  path: 'NATIVE_AMEND',
  priority: 'lost',
  orderId: 'order-1'
} });
assert.strictEqual(nativeLost.kind, 'applied');
assert.strictEqual(nativeLost.priority, 'lost');

var nativeUnreported = outcome.classifyAmend({ ok: true, data: {
  accepted: true,
  code: 'AMENDED',
  path: 'NATIVE_AMEND',
  orderId: 'order-1'
} });
assert.strictEqual(nativeUnreported.kind, 'applied');
assert.strictEqual(nativeUnreported.priority, null);

var nativeInvented = outcome.classifyAmend({ ok: true, data: {
  accepted: true,
  code: 'AMENDED',
  priority: 'yes',
  orderId: 'order-1'
} });
assert.strictEqual(nativeInvented.priority, null);

var nativeIdempotent = outcome.classifyAmend({ ok: true, data: {
  accepted: true,
  code: 'IDEMPOTENT_RETRY',
  priority: 'retained',
  orderId: 'order-1'
} });
assert.strictEqual(nativeIdempotent.kind, 'applied');
assert.strictEqual(nativeIdempotent.priority, 'retained');

var nativeUnknownTransport = outcome.classifyAmend({
  ok: false,
  reason: 'unreachable',
  status: 0,
  message: 'connection closed'
});
assert.strictEqual(nativeUnknownTransport.kind, 'unknown');
assert.strictEqual(nativeUnknownTransport.reasonCode, 'AMEND_OUTCOME_UNKNOWN');
assert.notStrictEqual(nativeUnknownTransport.priority, 'retained');

var nativeUnknownService = outcome.classifyAmend({ ok: true, data: {
  accepted: false,
  code: 'AMEND_UNKNOWN',
  reconciliationRequired: true,
  orderId: 'order-1'
} });
assert.strictEqual(nativeUnknownService.kind, 'unknown');
assert.strictEqual(nativeUnknownService.reasonCode, 'AMEND_UNKNOWN');

var nativeCancelReplace = outcome.classifyAmend({ ok: true, data: {
  accepted: false,
  code: 'CANCEL_REPLACE',
  path: 'NATIVE_AMEND',
  priority: null
} });
assert.strictEqual(nativeCancelReplace.kind, 'refused');
assert.strictEqual(nativeCancelReplace.reasonCode, 'CANCEL_REPLACE');
assert.notStrictEqual(nativeCancelReplace.priority, 'retained');

var nativeGarbage = outcome.classifyAmend({ ok: true, data: { hello: true } });
assert.strictEqual(nativeGarbage.kind, 'unknown');
assert.strictEqual(nativeGarbage.reasonCode, 'AMEND_OUTCOME_UNKNOWN');

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
var en = fs.readFileSync(path.join(__dirname, '..', 'lang', 'en.js'), 'utf8');
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
  'amendSubmitUnknownCopy',
  'method: \'PATCH\'',
  'classifyAmend',
  'toAmendOrderBody',
  'amendNativeCopy',
  'amendReplaceSuccess',
  'amendSuccessRetained',
  'NATIVE_AMEND',
  'CANCEL_REPLACE'
].forEach(function (needle) {
  assert.notStrictEqual(page.indexOf(needle), -1, 'Exchange.vue missing ' + needle);
});
assert.notStrictEqual(trade.indexOf('function toReplaceOrderBody'), -1, 'ix-trade missing replacement body helper');
assert.notStrictEqual(trade.indexOf('function toAmendOrderBody'), -1, 'ix-trade missing native amend body helper');
assert.notStrictEqual(trade.indexOf('function amendRoute'), -1, 'ix-trade missing amend route helper');
assert.notStrictEqual(classifier.indexOf('OUTCOME_UNKNOWN'), -1, 'classifier missing OUTCOME_UNKNOWN');
assert.notStrictEqual(classifier.indexOf('classifyReplace'), -1, 'classifier missing replacement outcomes');
assert.notStrictEqual(classifier.indexOf('classifyAmend'), -1, 'classifier missing native amend outcomes');
assert.notStrictEqual(classifier.indexOf("value === 'retained' || value === 'lost'"), -1, 'classifier must not invent queue priority');
['recoveryReason', 'executionOutcome', 'reconciliationKey'].forEach(function (needle) {
  assert.notStrictEqual(trade.indexOf(needle), -1, 'ix-trade missing ' + needle);
});
assert.ok(/const verdict = ixOrderOutcome\.classify\(res, 'submit'\)[\s\S]{0,900}if \(verdict\.kind === 'applied'\)/.test(page), 'submit success must follow outcome classification');
assert.ok(/method: 'PATCH'/.test(page), 'qty-down same-price must PATCH the native amend door');
assert.ok(/ixOrderOutcome\.classifyAmend\(res\)/.test(page), 'native amend success must follow classifyAmend');
assert.ok(/if \(verdict\.priority === 'retained'\)[\s\S]{0,120}amendSuccessRetained/.test(page), 'retained queue copy requires PATCH priority retained');
assert.ok(/isNativeAmend \? \$t\('exchange\.residual\.amendNativeCopy'\) : \$t\('exchange\.residual\.amendSagaCopy'\)/.test(page), 'desk note must switch native vs cancel/replace copy');
assert.ok(/submitReplaceAmend/.test(page) && /\/replace'/.test(page), 'price/TIF/side change must keep named replace saga');
assert.ok(en.indexOf('not a native amend') !== -1, 'saga copy must not claim replace is the only or native path');
assert.ok(en.indexOf('Queue place is kept only if the engine reports it') !== -1, 'native copy must not promise queue without the engine report');
assert.ok(page.indexOf("path: 'NATIVE_AMEND'") !== -1, 'native unknown must be tagged so reconcile does not close as cancel/replace');
assert.ok(/pendingOutcome\.path === 'NATIVE_AMEND'/.test(page), 'native unknown must stay unknown on a live same-id read');

console.log('ix-order-outcome golden: PASS');
