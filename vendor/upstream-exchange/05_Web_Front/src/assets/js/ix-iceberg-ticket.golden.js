/* Iceberg ticket wire — only display is visible; no invented display. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var iceTicket = require('./ix-iceberg-ticket.js');

var iceBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  iceberg: true,
  displayQty: '2'
});
assert.strictEqual(iceBody.iceberg, true);
assert.strictEqual(iceBody.displayQty, '2');
assert.strictEqual(iceBody.amount, '10');
assert.strictEqual(iceBody.price, '100');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    iceberg: true
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.iceberg_display_missing');

var same;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    iceberg: true,
    displayQty: '10'
  });
} catch (e) {
  same = e;
}
assert.ok(same);
assert.strictEqual(same.code, 'trade.iceberg_display_not_smaller');

var over;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    iceberg: true,
    displayQty: '11'
  });
} catch (e) {
  over = e;
}
assert.ok(over);
assert.strictEqual(over.code, 'trade.iceberg_display_not_smaller');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'iceberg'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'displayQty'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'iceberg_display_missing' }, 'place');
assert.ok(missMsg.indexOf('does not invent a display') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var smallMsg = tradeWire.orderFailureMessage({ reason: 'trade.iceberg_display_not_smaller' }, 'place');
assert.ok(smallMsg.indexOf('smaller than total') !== -1);
assert.ok(smallMsg.indexOf('does not invent a display') !== -1);

assert.strictEqual(typeof iceTicket.installBazaarIcebergTicket, 'function');
assert.strictEqual(iceTicket.installBazaarIcebergTicket(null), false);
assert.strictEqual(iceTicket.readTicketIceberg({}), false);
assert.strictEqual(iceTicket.readTicketIceberg({ iceberg: true }), true);
assert.strictEqual(iceTicket.readTicketIceberg({ displayQty: '2' }), true);

console.log('ix-iceberg-ticket golden: PASS');
