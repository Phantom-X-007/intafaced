/* Self-trade ticket wire — matching/trade refuse shows trade.self_trade; no silent rest, no invented fill. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var tradeWire = require('./ix-trade.js');
var outcome = require('./ix-order-outcome.js');
var selfTrade = require('./ix-self-trade-ticket.js');

function catchPlace(input) {
  try {
    return { body: tradeWire.toCreateOrderBody(input), err: null };
  } catch (e) {
    return { body: null, err: e };
  }
}

var msg = tradeWire.orderFailureMessage({ reason: 'self_trade' }, 'place');
assert.ok(msg.indexOf('trade.self_trade') !== -1);
assert.ok(msg.indexOf('does not invent a self-fill') !== -1);
assert.ok(msg.indexOf('No order was placed.') !== -1);
assert.ok(msg.indexOf('silent') === -1);

var tradeCode = tradeWire.orderFailureMessage({ reason: 'trade.self_trade' }, 'place');
assert.ok(tradeCode.indexOf('trade.self_trade') !== -1);
assert.ok(tradeCode.indexOf('does not invent a self-fill') !== -1);
assert.ok(tradeCode.indexOf('No order was placed.') !== -1);

var wireCode = tradeWire.orderFailureMessage(
  { reason: 'error', intafacedCode: 'trade.self_trade', message: 'InvalidOrder' },
  'create'
);
assert.ok(wireCode.indexOf('trade.self_trade') !== -1);
assert.ok(wireCode.indexOf('does not invent a self-fill') !== -1);
assert.ok(wireCode.indexOf('No order was placed.') !== -1);

var fromWireMessage = tradeWire.orderFailureMessage({
  reason: 'error',
  message: 'incoming order would match the same account; trade does not invent a self-fill'
}, 'place');
assert.ok(fromWireMessage.indexOf('trade.self_trade') !== -1);
assert.ok(fromWireMessage.indexOf('No order was placed.') !== -1);

var cancelSelf = tradeWire.orderFailureMessage({ reason: 'trade.self_trade' }, 'cancel');
assert.ok(cancelSelf.indexOf('trade.self_trade') !== -1);
assert.ok(cancelSelf.indexOf('The order was not cancelled.') !== -1);

assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'self_trade' }), true);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ intafacedCode: 'trade.self_trade' }), true);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'post_only_would_cross' }), false);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'self_trade_prevention' }), false);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'error' }), false);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ ok: true, data: { status: 'open' } }), false);

var silent = outcome.classify({
  ok: true,
  data: { id: 'take', status: 'rejected', rejectCode: 'self_trade' }
}, 'submit');
assert.strictEqual(silent.kind, 'refused');
assert.strictEqual(silent.reasonCode, 'trade.self_trade');
assert.notStrictEqual(silent.kind, 'applied');

var other = outcome.classify({
  ok: true,
  data: { id: 'o1', status: 'open', filled: '10' }
}, 'submit');
assert.strictEqual(other.kind, 'applied');

var otherAccount = catchPlace({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(otherAccount.err, null);
assert.ok(otherAccount.body);
assert.strictEqual(otherAccount.body.amount, '10');
assert.strictEqual(otherAccount.body.price, '100');
assert.strictEqual(otherAccount.body.timeInForce, 'GTC');
assert.strictEqual(Object.prototype.hasOwnProperty.call(otherAccount.body, 'selfTrade'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(otherAccount.body, 'fills'), false);

var sessionMsg = tradeWire.orderFailureMessage({ reason: 'session_unsupported' }, 'cancel');
assert.ok(sessionMsg.indexOf('does not invent a session') !== -1);
assert.ok(sessionMsg.indexOf('The order was not cancelled.') !== -1);
assert.strictEqual(selfTrade.isSessionMassCancelRefuse({ reason: 'session_unsupported' }), true);

var unauthorized = tradeWire.orderFailureMessage({ reason: 'unauthorized' }, 'place');
assert.ok(unauthorized.indexOf('self-fill') === -1);
assert.ok(unauthorized.indexOf('trade.self_trade') === -1);

assert.strictEqual(typeof selfTrade.installBazaarSelfTradeTicket, 'function');
assert.strictEqual(selfTrade.installBazaarSelfTradeTicket(null), false);

var oco = fs.readFileSync(path.join(__dirname, 'ix-oco-ticket.js'), 'utf8');
assert.notStrictEqual(oco.indexOf("require('./ix-self-trade-ticket.js')"), -1, 'oco chain must install the self-trade ticket');

var page = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'exchange', 'Exchange.vue'), 'utf8');
assert.notStrictEqual(page.indexOf('#ix-ticket-self-trade-note'), -1, 'Exchange.vue missing self-trade disclosure wrap');

console.log('ix-self-trade-ticket golden: PASS');
