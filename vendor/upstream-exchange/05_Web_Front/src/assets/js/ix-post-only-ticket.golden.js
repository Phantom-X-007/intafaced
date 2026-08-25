/* Post-only ticket wire — matching owns refuse; no invented price. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var poTicket = require('./ix-post-only-ticket.js');

var poBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'PO'
});
assert.strictEqual(poBody.timeInForce, 'PO');
assert.strictEqual(poBody.price, '100.10');
assert.strictEqual(poBody.postOnly, true);

var flagBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '1',
  price: '99.00',
  timeInForce: 'GTC',
  postOnly: true
});
assert.strictEqual(flagBody.timeInForce, 'PO');
assert.strictEqual(flagBody.price, '99.00');
assert.strictEqual(flagBody.postOnly, true);

var market;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'MARKET_PRICE',
    side: 'BUY',
    amount: '1',
    timeInForce: 'PO'
  });
} catch (e) {
  market = e;
}
assert.ok(market);
assert.strictEqual(market.code, 'trade.invalid_tif');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    timeInForce: 'PO'
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.invalid_tif');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(gtc.timeInForce, 'GTC');
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'postOnly'), false);
assert.notStrictEqual(gtc.timeInForce, 'PO');

var msg = tradeWire.orderFailureMessage({ reason: 'post_only_would_cross' }, 'place');
assert.ok(msg.indexOf('would take') !== -1);
assert.ok(msg.indexOf('No order was placed.') !== -1);

var tifMsg = tradeWire.orderFailureMessage({ reason: 'trade.invalid_tif' }, 'place');
assert.ok(tifMsg.indexOf('does not invent one') !== -1);

assert.strictEqual(typeof poTicket.installBazaarPostOnlyTicket, 'function');
assert.strictEqual(poTicket.installBazaarPostOnlyTicket(null), false);
assert.strictEqual(poTicket.readTicketPostOnly({}), false);
assert.strictEqual(poTicket.readTicketPostOnly({ postOnly: true }), true);
assert.strictEqual(poTicket.readTicketPostOnly({ timeInForce: 'PO' }), true);

console.log('ix-post-only-ticket golden: PASS');
