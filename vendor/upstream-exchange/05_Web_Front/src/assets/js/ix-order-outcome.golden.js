/* Pure command-outcome/state-transition goldens for the exchange desk. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var outcome = require('./ix-order-outcome.js');
var tradeWire = require('./ix-trade.js');

var replacementWire = tradeWire.toReplaceOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '0.000000000000000001',
  price: '12345.670000000000000001',
  timeInForce: 'GTC',
  clientOrderId: 'amend-stable-1'
});
assert.strictEqual(replacementWire.amount, '0.000000000000000001');
assert.strictEqual(replacementWire.price, '12345.670000000000000001');
assert.strictEqual(replacementWire.clientOrderId, 'amend-stable-1');

var nativeBody = tradeWire.toAmendOrderBody({
  amount: '0.000000000000000001',
  price: '12345.670000000000000001',
  side: 'BUY'
});
assert.strictEqual(nativeBody.amount, '0.000000000000000001');
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeBody, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeBody, 'side'), false);

var resting = {
  orderId: 'order-1',
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  direction: 'BUY',
  price: '100.10',
  amount: '2.5',
  tif: 'GTC'
};
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'NATIVE_AMEND');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '2.50', price: '100.10', timeInForce: 'GTC'
}), 'NATIVE_AMEND');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.11', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'SELL', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'ETH/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'IOC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '3', price: '100.10', timeInForce: 'GTC'
}), 'NATIVE_AMEND');
var qtyUpBody = tradeWire.toAmendOrderBody({ amount: '3', price: '99', side: 'SELL' });
assert.strictEqual(qtyUpBody.amount, '3');
assert.strictEqual(Object.prototype.hasOwnProperty.call(qtyUpBody, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(qtyUpBody, 'mid'), false);
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'MARKET_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC'
}), 'CANCEL_REPLACE');
assert.strictEqual(tradeWire.amendRoute(resting, {
  symbol: 'BTC/USDT', type: 'LIMIT_PRICE', side: 'BUY', amount: '1.25', price: '100.10', timeInForce: 'GTC', postOnly: true
}), 'CANCEL_REPLACE');
