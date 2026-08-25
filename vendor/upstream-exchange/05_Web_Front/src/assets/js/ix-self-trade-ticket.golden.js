/* Self-trade place refuse copy — no silent fill. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var selfTrade = require('./ix-self-trade-ticket.js');

var msg = tradeWire.orderFailureMessage({ reason: 'self_trade' }, 'place');
assert.ok(msg.indexOf('does not invent a self-fill') !== -1);
assert.ok(msg.indexOf('No order was placed.') !== -1);
assert.ok(msg.indexOf('silent') === -1);

var tradeCode = tradeWire.orderFailureMessage({ reason: 'trade.self_trade' }, 'place');
assert.ok(tradeCode.indexOf('does not invent a self-fill') !== -1);
assert.ok(tradeCode.indexOf('No order was placed.') !== -1);

var wireCode = tradeWire.orderFailureMessage(
  { reason: 'error', intafacedCode: 'trade.self_trade', message: 'InvalidOrder' },
  'create'
);
assert.ok(wireCode.indexOf('does not invent a self-fill') !== -1);
assert.ok(wireCode.indexOf('No order was placed.') !== -1);

var cancelSelf = tradeWire.orderFailureMessage({ reason: 'trade.self_trade' }, 'cancel');
assert.ok(cancelSelf.indexOf('The order was not cancelled.') !== -1);

assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'self_trade' }), true);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ intafacedCode: 'trade.self_trade' }), true);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'post_only_would_cross' }), false);
assert.strictEqual(selfTrade.isSelfTradeRefuse({ reason: 'self_trade_prevention' }), false);

var sessionMsg = tradeWire.orderFailureMessage({ reason: 'session_unsupported' }, 'cancel');
assert.ok(sessionMsg.indexOf('does not invent a session') !== -1);
assert.ok(sessionMsg.indexOf('The order was not cancelled.') !== -1);
assert.strictEqual(selfTrade.isSessionMassCancelRefuse({ reason: 'session_unsupported' }), true);

var other = tradeWire.orderFailureMessage({ reason: 'unauthorized' }, 'place');
assert.ok(other.indexOf('self-fill') === -1);

console.log('ix-self-trade-ticket golden: PASS');
