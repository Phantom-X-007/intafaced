/* Self-trade ticket — matching #3357 expires the rest (self_trade_prevention); incoming continues. No invented fill. */
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

assert.strictEqual(selfTrade.isSelfTradePrevention({ reason: 'self_trade_prevention' }), true);
assert.strictEqual(selfTrade.isSelfTradePrevention({
  ok: true,
  data: {
    id: 'take',
    status: 'open',
    cancellations: [{ orderId: 'own', reason: 'self_trade_prevention' }]
  }
}), true);
assert.strictEqual(selfTrade.isSelfTradePrevention({
  ok: true,
  data: {
    accepted: true,
    rejected: null,
    fills: [],
    resting: { orderId: 'take' },
    cancellations: [{ orderId: 'own', reason: 'self_trade_prevention' }]
  }
}), true);
assert.strictEqual(selfTrade.isSelfTradePrevention({ reason: 'self_trade' }), false);
assert.strictEqual(selfTrade.isSelfTradePrevention({ ok: true, data: { status: 'open', cancellations: [] } }), false);
assert.strictEqual(selfTrade.isSelfTradePrevention({ ok: true, data: { status: 'open' } }), false);
assert.strictEqual(selfTrade.isSelfTradePrevention({ reason: 'user' }), false);
assert.strictEqual(selfTrade.isSelfTradePrevention({ accountId: '' }), false);

var stp = tradeWire.orderFailureMessage({ reason: 'self_trade_prevention' }, 'place');
assert.ok(stp.indexOf('self_trade_prevention') !== -1);
assert.ok(stp.indexOf('resting order cancelled') !== -1);
assert.ok(stp.indexOf('self-trade prevention') !== -1);
assert.ok(stp.indexOf('Incoming continues') !== -1);
assert.ok(stp.indexOf('No order was placed.') === -1);
assert.ok(stp.indexOf('Incoming does not rest') === -1);
assert.ok(stp.indexOf('does not invent') !== -1);

var stpFromCancels = tradeWire.orderFailureMessage({
  ok: true,
  data: { id: 'take', status: 'open', cancellations: [{ reason: 'self_trade_prevention' }] }
}, 'place');
assert.ok(stpFromCancels.indexOf('self_trade_prevention') !== -1);
assert.ok(stpFromCancels.indexOf('Incoming continues') !== -1);
assert.ok(stpFromCancels.indexOf('No order was placed.') === -1);

var stpClass = outcome.classify({
  ok: true,
  data: { id: 'take', status: 'open', cancellations: [{ orderId: 'own', reason: 'self_trade_prevention' }] }
}, 'submit');
assert.strictEqual(stpClass.kind, 'applied');
assert.notStrictEqual(stpClass.kind, 'refused');
assert.ok(stpClass.message && stpClass.message.indexOf('self-trade prevention') !== -1);
assert.ok(stpClass.message.indexOf('No order was placed.') === -1);

var stpMatch = outcome.classify({
  ok: true,
  data: {
    accepted: true,
    rejected: null,
    fills: [],
    resting: { orderId: 'take' },
    cancellations: [{ orderId: 'own', reason: 'self_trade_prevention' }]
  }
}, 'submit');
assert.strictEqual(stpMatch.kind, 'applied');
assert.notStrictEqual(stpMatch.kind, 'refused');

var stpReasonClass = outcome.classify({ reason: 'self_trade_prevention' }, 'submit');
assert.strictEqual(stpReasonClass.kind, 'applied');
assert.notStrictEqual(stpReasonClass.kind, 'refused');
assert.ok(stpReasonClass.message && stpReasonClass.message.indexOf('Incoming continues') !== -1);

assert.ok(selfTrade.SELF_TRADE_PREVENTION_COPY.indexOf('Incoming continues') !== -1);
assert.ok(selfTrade.SELF_TRADE_PREVENTION_COPY.indexOf('No order was placed') === -1);

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

var ticketSrc = fs.readFileSync(path.join(__dirname, 'ix-self-trade-ticket.js'), 'utf8');
assert.ok(ticketSrc.indexOf('Incoming does not rest') === -1, 'ticket must not say incoming does not rest after expire-maker');
assert.ok(ticketSrc.indexOf('self-trade prevention') !== -1);
assert.ok(ticketSrc.indexOf('Incoming continues') !== -1);

console.log('ix-self-trade-ticket golden: PASS');
