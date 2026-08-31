/* Option amend-price ticket — price through trade; no invented mark. Not replace. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var amendTicket = require('./ix-option-amend-price-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var amended = tradeWire.toAmendOrderBody({
  amend: true,
  price: '101',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(amended.price, '101');
assert.strictEqual(amended.strike, '100');
assert.strictEqual(amended.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'qty'), false);

function refuseAmend(input) {
  var err;
  try {
    tradeWire.toAmendOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseAmend({
  amend: true,
  price: '101',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseAmend({
  amend: true,
  price: '101',
  strike: '100',
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var missPrice = refuseAmend({
  amend: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missPrice);
assert.strictEqual(missPrice.code, 'trade.missing_price');

var nativeQty = tradeWire.toAmendOrderBody({ amount: '3' });
assert.strictEqual(nativeQty.amount, '3');
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'expiry'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'replace'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'amend');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('The rest was not amended.') !== -1);

var missPriceMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_price' }, 'amend');
assert.ok(missPriceMsg.indexOf('requires a price') !== -1);
assert.ok(missPriceMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof amendTicket.installBazaarOptionAmendPriceTicket, 'function');
assert.strictEqual(amendTicket.installBazaarOptionAmendPriceTicket(null), false);
assert.strictEqual(amendTicket.readTicketOptionAmendPrice({}), false);
assert.strictEqual(amendTicket.readTicketOptionAmendPrice({ amend: true }), true);
assert.strictEqual(amendTicket.readTicketOptionAmendPrice({ replace: true, price: '101', qty: '3' }), false);

console.log('ix-option-amend-price-ticket golden: PASS');
