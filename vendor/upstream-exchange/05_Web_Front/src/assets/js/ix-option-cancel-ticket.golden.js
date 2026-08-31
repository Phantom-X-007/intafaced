/* Option cancel ticket — cancel through trade; no invented mark. Remainder leaves. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var cancelTicket = require('./ix-option-cancel-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var cancelled = tradeWire.toCancelOrderBody({
  cancel: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(cancelled.cancel, true);
assert.strictEqual(cancelled.strike, '100');
assert.strictEqual(cancelled.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'qty'), false);

var placed = tradeWire.toCreateOrderBody({
  cancel: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(placed.cancel, true);
assert.strictEqual(placed.strike, '100');
assert.strictEqual(placed.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(placed, 'mark'), false);

function refuseCancel(input) {
  var err;
  try {
    tradeWire.toCancelOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseCancel({
  cancel: true,
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseCancel({
  cancel: true,
  strike: '100',
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var native = tradeWire.toCancelOrderBody({ orderId: 'abc' });
assert.strictEqual(native.orderId, 'abc');
assert.strictEqual(Object.prototype.hasOwnProperty.call(native, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(native, 'expiry'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(native, 'cancel'), false);

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'cancel'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'cancel');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('The order was not cancelled.') !== -1);

var missExpiryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_expiry' }, 'cancel');
assert.ok(missExpiryMsg.indexOf('requires an expiry') !== -1);
assert.ok(missExpiryMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof cancelTicket.installBazaarOptionCancelTicket, 'function');
assert.strictEqual(cancelTicket.installBazaarOptionCancelTicket(null), false);
assert.strictEqual(cancelTicket.readTicketOptionCancel({}), false);
assert.strictEqual(cancelTicket.readTicketOptionCancel({ cancel: true }), true);
assert.strictEqual(cancelTicket.readTicketOptionCancel({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(cancelTicket.readTicketOptionCancel({ amendQty: true, qty: '3' }), false);
assert.strictEqual(cancelTicket.leftoverStatus({ status: 'CANCELED' }), 'CANCELED');
assert.strictEqual(cancelTicket.leftoverStatus(null), null);

console.log('ix-option-cancel-ticket golden: PASS');
