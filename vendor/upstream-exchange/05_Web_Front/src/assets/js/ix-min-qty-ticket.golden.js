/* Min-qty ticket wire — fill below the floor does not occur; no invented clip. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var mqTicket = require('./ix-min-qty-ticket.js');
var preview = require('./spot-order-preview.js');

var mqBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  minQty: '5'
});
assert.strictEqual(mqBody.minQty, '5');
assert.strictEqual(mqBody.amount, '10');
assert.strictEqual(mqBody.price, '100');

var equal = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  minQty: '10'
});
assert.strictEqual(equal.minQty, '10');

var over;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    minQty: '11'
  });
} catch (e) {
  over = e;
}
assert.ok(over);
assert.strictEqual(over.code, 'trade.min_qty_exceeds_qty');

var lastPlace;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '10',
    price: '100',
    minQty: '10.000000000000000001'
  });
} catch (e) {
  lastPlace = e;
}
assert.ok(lastPlace);
assert.strictEqual(lastPlace.code, 'trade.min_qty_exceeds_qty');

var missing = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(missing, 'minQty'), false);

var zero = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  minQty: '0'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(zero, 'minQty'), false);

var blank = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100',
  minQty: ''
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(blank, 'minQty'), false);

var overMsg = tradeWire.orderFailureMessage({ reason: 'min_qty_exceeds_qty' }, 'place');
assert.ok(overMsg.indexOf('does not invent a fill') !== -1);
assert.ok(overMsg.indexOf('No order was placed.') !== -1);

var overMsgTrade = tradeWire.orderFailureMessage({ reason: 'trade.min_qty_exceeds_qty' }, 'place');
assert.ok(overMsgTrade.indexOf('does not invent a fill') !== -1);

assert.strictEqual(typeof mqTicket.installBazaarMinQtyTicket, 'function');
assert.strictEqual(mqTicket.installBazaarMinQtyTicket(null), false);
assert.strictEqual(mqTicket.readTicketMinQty({}), false);
assert.strictEqual(mqTicket.readTicketMinQty({ minQty: '5' }), true);

var previewBody = preview.toRequest({
  symbol: 'BTC/USDT',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '10',
  price: '100',
  minQty: '5'
});
assert.strictEqual(previewBody.ok, true);
assert.strictEqual(previewBody.body.minQty, '5');

var previewZero = preview.toRequest({
  symbol: 'BTC/USDT',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '10',
  price: '100',
  minQty: '0'
});
assert.strictEqual(previewZero.ok, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(previewZero.body, 'minQty'), false);

var previewOver = preview.toRequest({
  symbol: 'BTC/USDT',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '10',
  price: '100',
  minQty: '11'
});
assert.strictEqual(previewOver.ok, false);
assert.strictEqual(previewOver.reason, 'minQty');

console.log('ix-min-qty-ticket golden: PASS');
