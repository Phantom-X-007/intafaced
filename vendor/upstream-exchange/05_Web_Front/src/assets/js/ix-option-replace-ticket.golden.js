/* Option replace ticket — price and qty together through trade; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var replaceTicket = require('./ix-option-replace-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var replaced = tradeWire.toReplaceOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '2',
  replace: true,
  price: '101',
  qty: '3',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(replaced.replace, true);
assert.strictEqual(replaced.price, '101');
assert.strictEqual(replaced.qty, '3');
assert.strictEqual(replaced.amount, '3');
assert.strictEqual(replaced.strike, '100');
assert.strictEqual(replaced.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(replaced, 'mark'), false);

var amended = tradeWire.toAmendOrderBody({
  replace: true,
  price: '101',
  qty: '3',
  strike: '100',
  expiry: EXPIRY,
  mark: '50',
  amount: '3'
});
assert.strictEqual(amended.replace, true);
assert.strictEqual(amended.price, '101');
assert.strictEqual(amended.qty, '3');
assert.strictEqual(amended.strike, '100');
assert.strictEqual(amended.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'mark'), false);

function refuseReplace(input) {
  var err;
  try {
    tradeWire.toReplaceOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseReplace({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  replace: true,
  price: '101',
  qty: '3',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseReplace({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  replace: true,
  price: '101',
  qty: '3',
  strike: '100',
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var missPrice = refuseReplace({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  replace: true,
  qty: '3',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missPrice);
assert.strictEqual(missPrice.code, 'trade.missing_price');

var missQty = refuseReplace({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  replace: true,
  price: '101',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missQty);
assert.strictEqual(missQty.code, 'trade.missing_qty');

var nativeQty = tradeWire.toAmendOrderBody({ amount: '3' });
assert.strictEqual(nativeQty.amount, '3');
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'expiry'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'replace'), false);

var gtc = tradeWire.toReplaceOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'replace');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('The rest was not replaced.') !== -1);

var missPriceMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_price' }, 'replace');
assert.ok(missPriceMsg.indexOf('requires a price') !== -1);
assert.ok(missPriceMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof replaceTicket.installBazaarOptionReplaceTicket, 'function');
assert.strictEqual(replaceTicket.installBazaarOptionReplaceTicket(null), false);
assert.strictEqual(replaceTicket.readTicketOptionReplace({}), false);
assert.strictEqual(replaceTicket.readTicketOptionReplace({ replace: true }), true);

console.log('ix-option-replace-ticket golden: PASS');
