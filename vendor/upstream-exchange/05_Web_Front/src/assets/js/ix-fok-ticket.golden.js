/* FOK ticket wire — fill completely or cancel the whole; no leftover rest; no invented fill. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var fokTicket = require('./ix-fok-ticket.js');

var fokBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'FOK'
});
assert.strictEqual(fokBody.timeInForce, 'FOK');
assert.strictEqual(fokBody.price, '100.10');
assert.strictEqual(Object.prototype.hasOwnProperty.call(fokBody, 'resting'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(fokBody, 'leftover'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(fokBody, 'fills'), false);

var marketBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'MARKET_PRICE',
  side: 'BUY',
  amount: '1',
  timeInForce: 'FOK'
});
assert.strictEqual(marketBody.timeInForce, 'FOK');
assert.strictEqual(Object.prototype.hasOwnProperty.call(marketBody, 'price'), false);

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    timeInForce: 'FOK'
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.invalid_tif');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(gtc.timeInForce, 'GTC');
assert.notStrictEqual(gtc.timeInForce, 'FOK');

var unfillable = tradeWire.orderFailureMessage({ reason: 'fok_unfillable' }, 'place');
assert.ok(unfillable.indexOf('could not fill completely') !== -1);
assert.ok(unfillable.indexOf('whole order was cancelled') !== -1);
assert.ok(unfillable.indexOf('leftover was rested') !== -1);

var tifMsg = tradeWire.orderFailureMessage({ reason: 'trade.invalid_tif' }, 'place');
assert.ok(tifMsg.indexOf('does not invent a fill') !== -1);

assert.strictEqual(typeof fokTicket.installBazaarFokTicket, 'function');
assert.strictEqual(fokTicket.installBazaarFokTicket(null), false);
assert.strictEqual(fokTicket.readTicketFok({}), false);
assert.strictEqual(fokTicket.readTicketFok({ timeInForce: 'FOK' }), true);
assert.strictEqual(fokTicket.leftoverStatus({ status: 'cancelled' }), 'cancelled');
assert.strictEqual(fokTicket.leftoverStatus({ status: 'CANCELED' }), 'cancelled');
assert.strictEqual(fokTicket.leftoverStatus({ status: 'rejected' }), 'cancelled');
assert.notStrictEqual(fokTicket.leftoverStatus({ status: 'open' }), 'cancelled');

console.log('ix-fok-ticket golden: PASS');
