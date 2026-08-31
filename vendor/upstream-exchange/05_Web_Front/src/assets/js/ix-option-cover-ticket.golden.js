/* Option cover ticket — cover short after assignment through trade; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var coverTicket = require('./ix-option-cover-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var covered = tradeWire.toCreateOrderBody({
  cover: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(covered.cover, true);
assert.strictEqual(covered.strike, '100');
assert.strictEqual(covered.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'cancel'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'exercise'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'assign'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(covered, 'qty'), false);

function refuseCover(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseCover({
  cover: true,
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseCover({
  cover: true,
  strike: '100',
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
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'cover'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);

var notExercise = tradeWire.toCreateOrderBody({
  exercise: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notExercise, 'cover'), false);

var notCancel = tradeWire.toCreateOrderBody({
  cancel: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notCancel, 'cover'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'place');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('requires a strike') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missExpiryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_expiry' }, 'place');
assert.ok(missExpiryMsg.indexOf('requires an expiry') !== -1);
assert.ok(missExpiryMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof coverTicket.installBazaarOptionCoverTicket, 'function');
assert.strictEqual(coverTicket.installBazaarOptionCoverTicket(null), false);
assert.strictEqual(coverTicket.readTicketOptionCover({}), false);
assert.strictEqual(coverTicket.readTicketOptionCover({ cover: true }), true);
assert.strictEqual(coverTicket.readTicketOptionCover({ exercise: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(coverTicket.readTicketOptionCover({ cancel: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(coverTicket.readTicketOptionCover({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(coverTicket.readTicketOptionCover({ amendQty: true, qty: '3' }), false);
assert.strictEqual(coverTicket.readTicketOptionCover({ assign: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(coverTicket.leftoverStatus({ status: 'FILLED' }), 'FILLED');
assert.strictEqual(coverTicket.leftoverStatus(null), null);

console.log('ix-option-cover-ticket golden: PASS');
