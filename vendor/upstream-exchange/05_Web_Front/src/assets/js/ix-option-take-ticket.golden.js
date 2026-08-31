/* Option take ticket — take against a rest through trade; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var takeTicket = require('./ix-option-take-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var taken = tradeWire.toCreateOrderBody({
  take: true,
  symbol: 'BTC/USDT',
  side: 'SELL',
  amount: '10',
  price: '99',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(taken.take, true);
assert.strictEqual(taken.type, 'option');
assert.strictEqual(taken.strike, '100');
assert.strictEqual(taken.expiry, EXPIRY);
assert.strictEqual(taken.price, '99');
assert.strictEqual(Object.prototype.hasOwnProperty.call(taken, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(taken, 'cover'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(taken, 'exercise'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(taken, 'expire'), false);

function refuseTake(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseTake({
  take: true,
  expiry: EXPIRY,
  price: '99',
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseTake({
  take: true,
  strike: '100',
  price: '99',
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var missPrice = refuseTake({
  take: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missPrice);
assert.strictEqual(missPrice.code, 'trade.missing_price');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'take'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);

var notPlace = tradeWire.toCreateOrderBody({
  type: 'option',
  strike: '100',
  expiry: EXPIRY,
  price: '99',
  amount: '10',
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notPlace, 'take'), false);

var notCover = tradeWire.toCreateOrderBody({
  cover: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notCover, 'take'), false);

var notExercise = tradeWire.toCreateOrderBody({
  exercise: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notExercise, 'take'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'place');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('requires a strike') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missExpiryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_expiry' }, 'place');
assert.ok(missExpiryMsg.indexOf('requires an expiry') !== -1);
assert.ok(missExpiryMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof takeTicket.installBazaarOptionTakeTicket, 'function');
assert.strictEqual(takeTicket.installBazaarOptionTakeTicket(null), false);
assert.strictEqual(takeTicket.readTicketOptionTake({}), false);
assert.strictEqual(takeTicket.readTicketOptionTake({ take: true }), true);
assert.strictEqual(takeTicket.readTicketOptionTake({ type: 'option', strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(takeTicket.readTicketOptionTake({ cover: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(takeTicket.readTicketOptionTake({ exercise: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(takeTicket.readTicketOptionTake({ cancel: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(takeTicket.readTicketOptionTake({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(takeTicket.leftoverStatus({ status: 'FILLED' }), 'FILLED');
assert.strictEqual(takeTicket.leftoverStatus(null), null);

console.log('ix-option-take-ticket golden: PASS');
