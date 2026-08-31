/* Option amend-qty ticket — qty through trade; no invented mark. Not price. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var amendTicket = require('./ix-option-amend-qty-ticket.js');

var EXPIRY = '2026-12-25T00:00:00.000Z';

var amended = tradeWire.toAmendOrderBody({
  amendQty: true,
  qty: '3',
  strike: '100',
  expiry: EXPIRY,
  mark: '50'
});
assert.strictEqual(amended.qty, '3');
assert.strictEqual(amended.amount, '3');
assert.strictEqual(amended.strike, '100');
assert.strictEqual(amended.expiry, EXPIRY);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'replace'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(amended, 'price'), false);

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
  amendQty: true,
  qty: '3',
  expiry: EXPIRY,
  mark: '50'
});
assert.ok(missStrike);
assert.strictEqual(missStrike.code, 'trade.missing_strike');

var missExpiry = refuseAmend({
  amendQty: true,
  qty: '3',
  strike: '100',
  mark: '50'
});
assert.ok(missExpiry);
assert.strictEqual(missExpiry.code, 'trade.missing_expiry');

var missQty = refuseAmend({
  amendQty: true,
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
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'qty'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(nativeQty, 'replace'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_strike' }, 'amend');
assert.ok(missMsg.indexOf('does not invent a mark') !== -1);
assert.ok(missMsg.indexOf('The rest was not amended.') !== -1);

var missQtyMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_qty' }, 'amend');
assert.ok(missQtyMsg.indexOf('requires a qty') !== -1);
assert.ok(missQtyMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof amendTicket.installBazaarOptionAmendQtyTicket, 'function');
assert.strictEqual(amendTicket.installBazaarOptionAmendQtyTicket(null), false);
assert.strictEqual(amendTicket.readTicketOptionAmendQty({}), false);
assert.strictEqual(amendTicket.readTicketOptionAmendQty({ amendQty: true }), true);
assert.strictEqual(amendTicket.readTicketOptionAmendQty({ replace: true, price: '101', qty: '3' }), false);
assert.strictEqual(amendTicket.readTicketOptionAmendQty({ amend: true, price: '101', strike: '100', expiry: EXPIRY }), false);

console.log('ix-option-amend-qty-ticket golden: PASS');
