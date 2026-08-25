/* IOC ticket wire — leftover cancels; no invented leftover rest. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var iocTicket = require('./ix-ioc-ticket.js');

var iocBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'IOC'
});
assert.strictEqual(iocBody.timeInForce, 'IOC');
assert.strictEqual(iocBody.price, '100.10');
assert.strictEqual(Object.prototype.hasOwnProperty.call(iocBody, 'resting'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(iocBody, 'leftover'), false);

var marketBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'MARKET_PRICE',
  side: 'BUY',
  amount: '1',
  timeInForce: 'IOC'
});
assert.strictEqual(marketBody.timeInForce, 'IOC');
assert.strictEqual(Object.prototype.hasOwnProperty.call(marketBody, 'price'), false);

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    timeInForce: 'IOC'
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
assert.notStrictEqual(gtc.timeInForce, 'IOC');

var rem = tradeWire.orderFailureMessage({ reason: 'ioc_remainder' }, 'place');
assert.ok(rem.indexOf('remainder cancelled') !== -1);
assert.ok(rem.indexOf('leftover was rested') !== -1);

var mktRem = tradeWire.orderFailureMessage({ reason: 'market_remainder' }, 'place');
assert.ok(mktRem.indexOf('remainder cancelled') !== -1);

var tifMsg = tradeWire.orderFailureMessage({ reason: 'trade.invalid_tif' }, 'place');
assert.ok(tifMsg.indexOf('does not invent one') !== -1);

assert.strictEqual(typeof iocTicket.installBazaarIocTicket, 'function');
assert.strictEqual(iocTicket.installBazaarIocTicket(null), false);
assert.strictEqual(iocTicket.readTicketIoc({}), false);
assert.strictEqual(iocTicket.readTicketIoc({ timeInForce: 'IOC' }), true);
assert.strictEqual(iocTicket.leftoverStatus({ status: 'cancelled' }), 'cancelled');
assert.strictEqual(iocTicket.leftoverStatus({ status: 'CANCELED' }), 'cancelled');
assert.notStrictEqual(iocTicket.leftoverStatus({ status: 'open' }), 'cancelled');

console.log('ix-ioc-ticket golden: PASS');
