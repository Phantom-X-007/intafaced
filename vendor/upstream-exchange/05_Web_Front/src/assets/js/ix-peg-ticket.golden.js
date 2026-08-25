/* Peg ticket wire — refuse unsupported peg/mid/relative; no invented mid, no silent limit. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var pegTicket = require('./ix-peg-ticket.js');

function catchPlace(input) {
  try {
    tradeWire.toCreateOrderBody(input);
    return null;
  } catch (e) {
    return e;
  }
}

var base = {
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100'
};

var pegErr = catchPlace(Object.assign({}, base, { peg: true }));
assert.ok(pegErr);
assert.strictEqual(pegErr.code, 'trade.peg_unsupported');
assert.ok(pegErr.message.indexOf('does not invent a reference price') !== -1);

var midErr = catchPlace(Object.assign({}, base, { midpoint: true }));
assert.ok(midErr);
assert.strictEqual(midErr.code, 'trade.midpoint_unsupported');
assert.ok(midErr.message.indexOf('does not invent a mid') !== -1);

var relErr = catchPlace(Object.assign({}, base, { relative: true }));
assert.ok(relErr);
assert.strictEqual(relErr.code, 'trade.relative_unsupported');

var gtc = tradeWire.toCreateOrderBody(Object.assign({}, base, { timeInForce: 'GTC' }));
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'peg'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'midpoint'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'relative'), false);
assert.strictEqual(gtc.amount, '10');
assert.strictEqual(gtc.price, '100');

var off = tradeWire.toCreateOrderBody(Object.assign({}, base, { peg: false, midpoint: false, relative: false }));
assert.strictEqual(Object.prototype.hasOwnProperty.call(off, 'peg'), false);

var pegMsg = tradeWire.orderFailureMessage({ reason: 'peg_unsupported' }, 'place');
assert.ok(pegMsg.indexOf('does not invent a reference price') !== -1);
assert.ok(pegMsg.indexOf('No order was placed.') !== -1);

var midMsg = tradeWire.orderFailureMessage({ reason: 'trade.midpoint_unsupported' }, 'place');
assert.ok(midMsg.indexOf('does not invent a mid') !== -1);

var relMsg = tradeWire.orderFailureMessage({ reason: 'relative_unsupported' }, 'place');
assert.ok(relMsg.indexOf('does not invent a reference price') !== -1);

assert.strictEqual(typeof pegTicket.installBazaarPegTicket, 'function');
assert.strictEqual(pegTicket.installBazaarPegTicket(null), false);
assert.strictEqual(pegTicket.readTicketPeg({}), false);
assert.strictEqual(pegTicket.readTicketPeg({ peg: false }), false);
assert.strictEqual(pegTicket.readTicketPeg({ peg: true }), true);
assert.strictEqual(pegTicket.readTicketMidpoint({ midpoint: true }), true);
assert.strictEqual(pegTicket.readTicketRelative({ relative: true }), true);

var pegAssert;
try {
  pegTicket.assertTicketPeg({ peg: true });
} catch (e) {
  pegAssert = e;
}
assert.ok(pegAssert);
assert.strictEqual(pegAssert.code, 'trade.peg_unsupported');

pegTicket.assertTicketPeg({});
pegTicket.assertTicketPeg({ peg: false });

console.log('ix-peg-ticket golden: PASS');
