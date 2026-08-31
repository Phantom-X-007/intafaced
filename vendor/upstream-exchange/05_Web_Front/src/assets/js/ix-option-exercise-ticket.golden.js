/* Option exercise ticket — exercise through trade; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var exerciseTicket = require('./ix-option-exercise-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var exercised = tradeWire.toCreateOrderBody({
  exercise: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(exercised.exercise, true);
assert.strictEqual(exercised.strike, '100');
assert.strictEqual(exercised.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(exercised, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(exercised, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(exercised, 'cancel'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(exercised, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(exercised, 'qty'), false);

function refuseExercise(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missStrike = refuseExercise({
  exercise: true,
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseExercise({
  exercise: true,
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
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'exercise'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'strike'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'expiry'), false);

var notCancel = tradeWire.toCreateOrderBody({
  cancel: true,
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(notCancel, 'exercise'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'place');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('requires a strike') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missExpiryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_expiry' }, 'place');
assert.ok(missExpiryMsg.indexOf('requires an expiry') !== -1);
assert.ok(missExpiryMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof exerciseTicket.installBazaarOptionExerciseTicket, 'function');
assert.strictEqual(exerciseTicket.installBazaarOptionExerciseTicket(null), false);
assert.strictEqual(exerciseTicket.readTicketOptionExercise({}), false);
assert.strictEqual(exerciseTicket.readTicketOptionExercise({ exercise: true }), true);
assert.strictEqual(exerciseTicket.readTicketOptionExercise({ cancel: true, strike: '100', expiry: EXPIRY }), false);
assert.strictEqual(exerciseTicket.readTicketOptionExercise({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(exerciseTicket.readTicketOptionExercise({ amendQty: true, qty: '3' }), false);
assert.strictEqual(exerciseTicket.leftoverStatus({ status: 'FILLED' }), 'FILLED');
assert.strictEqual(exerciseTicket.leftoverStatus(null), null);

console.log('ix-option-exercise-ticket golden: PASS');
