/* Stop-limit ticket wire — off-book until print; no invented trigger. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var slTicket = require('./ix-stop-limit-ticket.js');

var slBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  stopPx: '105'
});
assert.strictEqual(slBody.type, 'stop_limit');
assert.strictEqual(slBody.stopPx, '105');
assert.strictEqual(slBody.stopPrice, '105');
assert.strictEqual(slBody.amount, '10');
assert.strictEqual(slBody.price, '100');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'stop_limit',
    side: 'BUY',
    amount: '10',
    price: '100'
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.missing_stop_price');

var blank;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    stopPx: ''
  });
} catch (e) {
  blank = e;
}
assert.ok(blank);
assert.strictEqual(blank.code, 'trade.missing_stop_price');

var zero;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    stopPx: '0'
  });
} catch (e) {
  zero = e;
}
assert.ok(zero);
assert.strictEqual(zero.code, 'trade.missing_stop_price');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.notStrictEqual(gtc.type, 'stop_limit');
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'stopPx'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'stopPrice'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_stop_price' }, 'place');
assert.ok(missMsg.indexOf('does not invent a trigger') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missMsgTrade = tradeWire.orderFailureMessage({ reason: 'trade.missing_stop_price' }, 'place');
assert.ok(missMsgTrade.indexOf('does not invent a trigger') !== -1);

assert.strictEqual(typeof slTicket.installBazaarStopLimitTicket, 'function');
assert.strictEqual(slTicket.installBazaarStopLimitTicket(null), false);
assert.strictEqual(slTicket.readTicketStopLimit({}), false);
assert.strictEqual(slTicket.readTicketStopLimit({ type: 'stop_limit' }), true);
assert.strictEqual(slTicket.readTicketStopLimit({ stopPx: '105' }), true);

console.log('ix-stop-limit-ticket golden: PASS');
