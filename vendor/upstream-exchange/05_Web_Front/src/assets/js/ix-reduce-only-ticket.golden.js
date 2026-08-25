/* Reduce-only ticket wire — matching owns refuse; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var roTicket = require('./ix-reduce-only-ticket.js');

var roBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTC',
  reduceOnly: true
});
assert.strictEqual(roBody.reduceOnly, true);
assert.strictEqual(roBody.timeInForce, 'GTC');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'reduceOnly'), false);

var msg = tradeWire.orderFailureMessage({ reason: 'would_increase_position' }, 'place');
assert.ok(msg.indexOf('increase the position') !== -1);
assert.ok(msg.indexOf('No order was placed.') !== -1);

assert.strictEqual(typeof roTicket.installBazaarReduceOnlyTicket, 'function');
assert.strictEqual(roTicket.installBazaarReduceOnlyTicket(null), false);
assert.strictEqual(roTicket.readTicketReduceOnly({}), false);
assert.strictEqual(roTicket.readTicketReduceOnly({ reduceOnly: true }), true);

console.log('ix-reduce-only-ticket golden: PASS');
