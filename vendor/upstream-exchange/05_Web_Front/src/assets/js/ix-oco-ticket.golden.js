/* OCO ticket wire — both stopPrices are the caller's; no invented trigger. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var ocoTicket = require('./ix-oco-ticket.js');

var ocoBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTC',
  takeProfit: { stopPrice: '110.00' },
  stopLoss: { stopPrice: '90.00' }
});
assert.strictEqual(ocoBody.takeProfit.stopPrice, '110.00');
assert.strictEqual(ocoBody.stopLoss.stopPrice, '90.00');
assert.strictEqual(ocoBody.timeInForce, 'GTC');

var withLimit = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '0.5',
  price: '100',
  timeInForce: 'GTC',
  takeProfit: { stopPrice: '95.00', price: '94.50' },
  stopLoss: { stopPrice: '108.00', price: '108.50' }
});
assert.strictEqual(withLimit.takeProfit.price, '94.50');
assert.strictEqual(withLimit.stopLoss.price, '108.50');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    price: '100',
    timeInForce: 'GTC',
    takeProfit: { stopPrice: '110.00' }
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.missing_oco_trigger');

var blank;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    price: '100',
    timeInForce: 'GTC',
    takeProfit: { stopPrice: '' },
    stopLoss: { stopPrice: '90.00' }
  });
} catch (e) {
  blank = e;
}
assert.ok(blank);
assert.strictEqual(blank.code, 'trade.missing_oco_trigger');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'takeProfit'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'stopLoss'), false);

var msg = tradeWire.orderFailureMessage({ reason: 'trade.missing_oco_trigger' }, 'place');
assert.ok(msg.indexOf('does not invent a trigger') !== -1);
assert.ok(msg.indexOf('No order was placed.') !== -1);

assert.strictEqual(typeof ocoTicket.installBazaarOcoTicket, 'function');
assert.strictEqual(ocoTicket.installBazaarOcoTicket(null), false);

console.log('ix-oco-ticket golden: PASS');
