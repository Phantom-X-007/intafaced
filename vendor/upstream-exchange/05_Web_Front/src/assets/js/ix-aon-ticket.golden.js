/* AON ticket wire — fill remaining in one sweep or do not stub; no invented fill. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var aonTicket = require('./ix-aon-ticket.js');

var aonBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  aon: true
});
assert.strictEqual(aonBody.aon, true);
assert.strictEqual(aonBody.amount, '10');
assert.strictEqual(aonBody.price, '100');

var combo;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    aon: true,
    iceberg: true,
    displayQty: '2'
  });
} catch (e) {
  combo = e;
}
assert.ok(combo);
assert.strictEqual(combo.code, 'trade.aon_iceberg');

var comboDisplay;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    aon: true,
    displayQty: '2'
  });
} catch (e) {
  comboDisplay = e;
}
assert.ok(comboDisplay);
assert.strictEqual(comboDisplay.code, 'trade.aon_iceberg');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'aon'), false);

var off = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  aon: false
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(off, 'aon'), false);

var iceOnly = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  iceberg: true,
  displayQty: '2'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(iceOnly, 'aon'), false);
assert.strictEqual(iceOnly.iceberg, true);

var comboMsg = tradeWire.orderFailureMessage({ reason: 'aon_iceberg' }, 'place');
assert.ok(comboMsg.indexOf('does not invent a fill') !== -1);
assert.ok(comboMsg.indexOf('No order was placed.') !== -1);

var comboMsgTrade = tradeWire.orderFailureMessage({ reason: 'trade.aon_iceberg' }, 'place');
assert.ok(comboMsgTrade.indexOf('does not invent a fill') !== -1);

assert.strictEqual(typeof aonTicket.installBazaarAonTicket, 'function');
assert.strictEqual(aonTicket.installBazaarAonTicket(null), false);
assert.strictEqual(aonTicket.readTicketAon({}), false);
assert.strictEqual(aonTicket.readTicketAon({ aon: false }), false);
assert.strictEqual(aonTicket.readTicketAon({ aon: true }), true);

var iceAssert;
try {
  aonTicket.assertTicketAon({ aon: true, iceberg: true });
} catch (e) {
  iceAssert = e;
}
assert.ok(iceAssert);
assert.strictEqual(iceAssert.code, 'trade.aon_iceberg');

aonTicket.assertTicketAon({ aon: true });
aonTicket.assertTicketAon({});

console.log('ix-aon-ticket golden: PASS');
