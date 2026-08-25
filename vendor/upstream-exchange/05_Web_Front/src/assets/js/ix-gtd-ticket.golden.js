/* GTD/GTT ticket wire — expireAt is caller-supplied, never invented. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var gtdTicket = require('./ix-gtd-ticket.js');

var gtdBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTD',
  expireAt: '2026-08-26T12:00:00.000Z'
});
assert.strictEqual(gtdBody.timeInForce, 'GTD');
assert.strictEqual(gtdBody.expireAt, '2026-08-26T12:00:00.000Z');

var gttBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '0.5',
  price: '99.00',
  timeInForce: 'GTT',
  expireAt: '2026-08-25T18:00:00.000Z'
});
assert.strictEqual(gttBody.timeInForce, 'GTT');
assert.strictEqual(gttBody.expireAt, '2026-08-25T18:00:00.000Z');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    price: '100',
    timeInForce: 'GTD'
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.missing_expire_at');

var blank;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    price: '100',
    timeInForce: 'GTT',
    expireAt: ''
  });
} catch (e) {
  blank = e;
}
assert.ok(blank);
assert.strictEqual(blank.code, 'trade.missing_expire_at');

var gtcNoExpire = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(gtcNoExpire.timeInForce, 'GTC');
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtcNoExpire, 'expireAt'), false);

var desk = tradeWire.toDeskOrder({
  id: 'order-gtd',
  symbol: 'BTC/USDT',
  type: 'limit',
  side: 'buy',
  price: '100.10',
  amount: '1.25',
  filled: '0',
  cost: null,
  timestamp: 1,
  status: 'open',
  timeInForce: 'GTD',
  expireAt: '2026-08-26T12:00:00.000Z'
});
assert.strictEqual(desk.tif, 'GTD');
assert.strictEqual(desk.expireAt, '2026-08-26T12:00:00.000Z');
assert.strictEqual(desk.status, 'TRADING');

assert.strictEqual(typeof gtdTicket.installBazaarGtdTicket, 'function');
assert.strictEqual(gtdTicket.installBazaarGtdTicket(null), false);

console.log('ix-gtd-ticket golden: PASS');
