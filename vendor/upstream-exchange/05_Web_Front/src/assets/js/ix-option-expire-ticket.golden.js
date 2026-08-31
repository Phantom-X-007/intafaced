/* Option expire ticket — expire at expiry through trade; no invented mark or clock. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var expireTicket = require('./ix-option-expire-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';
var AFTER = '2027-01-01T00:00:00.000Z';

var expired = tradeWire.toCreateOrderBody({
  expire: true,
  strike: '100',
  expiry: EXPIRY,
  now: AFTER,
  mark: '50'
});
assert.strictEqual(expired.expire, true);
assert.strictEqual(expired.strike, '100');
assert.strictEqual(expired.expiry, EXPIRY);
assert.strictEqual(expired.now, AFTER);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'cancel'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'exercise'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'cover'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(expired, 'qty'), false);

var noClock = tradeWire.toCreateOrderBody({
  expire: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(noClock.expire, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(noClock, 'now'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(noClock, 'mark'), false);

function refuseExpire(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseExpire({
  expire: true,
  expiry: EXPIRY,
  now: AFTER,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseExpire({
  expire: true,
  strike: '100',
  now: AFTER,
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expire'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'now'), false);

var notCover = tradeWire.toCreateOrderBody({
  cover: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notCover, 'expire'), false);

var notExercise = tradeWire.toCreateOrderBody({
  exercise: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notExercise, 'expire'), false);

var notCancel = tradeWire.toCreateOrderBody({
  cancel: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notCancel, 'expire'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'place');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('requires a strike') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missExpiryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_expiry' }, 'place');
assert.ok(missExpiryMsg.indexOf('requires an expiry') !== -1);
assert.ok(missExpiryMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof expireTicket.installBazaarOptionExpireTicket, 'function');
assert.strictEqual(expireTicket.installBazaarOptionExpireTicket(null), false);
assert.strictEqual(expireTicket.readTicketOptionExpire({}), false);
assert.strictEqual(expireTicket.readTicketOptionExpire({ expire: true }), true);
assert.strictEqual(expireTicket.readTicketOptionExpire({ cover: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(expireTicket.readTicketOptionExpire({ exercise: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(expireTicket.readTicketOptionExpire({ cancel: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(expireTicket.readTicketOptionExpire({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(expireTicket.readTicketOptionExpire({ amendQty: true, qty: '3' }), false);
assert.strictEqual(expireTicket.leftoverStatus({ status: 'expired' }), 'expired');
assert.strictEqual(expireTicket.leftoverStatus(null), null);

console.log('ix-option-expire-ticket golden: PASS');
