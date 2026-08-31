/* Option place ticket — rest through trade; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var placeTicket = require('./ix-option-place-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var rested = tradeWire.toCreateOrderBody({
  type: 'option',
  symbol: 'BTC/USDT',
  side: 'BUY',
  amount: '10',
  price: '99',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(rested.type, 'option');
assert.strictEqual(rested.strike, '100');
assert.strictEqual(rested.expiry, EXPIRY);
assert.strictEqual(rested.price, '99');
assert.strictEqual(rested.amount, '10');
assert.strictEqual(Object.prototype.hasOwnProperty.call(rested, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(rested, 'cover'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(rested, 'exercise'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(rested, 'expire'), false);

function refusePlace(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refusePlace({
  type: 'option',
  expiry: EXPIRY,
  price: '99',
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refusePlace({
  type: 'option',
  strike: '100',
  price: '99',
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var missPrice = refusePlace({
  type: 'option',
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
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);
assert.notStrictEqual(gtc.type, 'option');

var notCover = tradeWire.toCreateOrderBody({
  cover: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.notStrictEqual(notCover.type, 'option');

var notExpire = tradeWire.toCreateOrderBody({
  expire: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.notStrictEqual(notExpire.type, 'option');

var notExercise = tradeWire.toCreateOrderBody({
  exercise: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.notStrictEqual(notExercise.type, 'option');

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'place');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('requires a strike') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missExpiryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_expiry' }, 'place');
assert.ok(missExpiryMsg.indexOf('requires an expiry') !== -1);
assert.ok(missExpiryMsg.indexOf('does not invent a mark') !== -1);

var missPriceMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_price' }, 'place');
assert.ok(missPriceMsg.indexOf('rests as a limit') !== -1);
assert.ok(missPriceMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof placeTicket.installBazaarOptionPlaceTicket, 'function');
assert.strictEqual(placeTicket.installBazaarOptionPlaceTicket(null), false);
assert.strictEqual(placeTicket.readTicketOptionPlace({}), false);
assert.strictEqual(placeTicket.readTicketOptionPlace({ type: 'option' }), true);
assert.strictEqual(placeTicket.readTicketOptionPlace({ cover: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(placeTicket.readTicketOptionPlace({ expire: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(placeTicket.readTicketOptionPlace({ exercise: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(placeTicket.readTicketOptionPlace({ cancel: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(placeTicket.readTicketOptionPlace({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(placeTicket.leftoverStatus({ status: 'open' }), 'open');
assert.strictEqual(placeTicket.leftoverStatus(null), null);

console.log('ix-option-place-ticket golden: PASS');
