/* Trailing-stop ticket wire — walks with the mark; no invented distance or mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var tsTicket = require('./ix-trailing-stop-ticket.js');

var tsBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'trailing_stop',
  side: 'SELL',
  amount: '10',
  price: '100',
  trail: '5',
  mark: '100'
});
assert.strictEqual(tsBody.type, 'limit');
assert.strictEqual(tsBody.trail, '5');
assert.strictEqual(tsBody.mark, '100');
assert.strictEqual(tsBody.amount, '10');
assert.strictEqual(tsBody.price, '100');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'trailing_stop',
    side: 'SELL',
    amount: '10',
    price: '100'
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.missing_trail');
assert.strictEqual(missing.message, 'a trailing stop requires a trail; trade does not invent a distance');

var blank;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'SELL',
    amount: '10',
    price: '100',
    trail: '',
    mark: '100'
  });
} catch (e) {
  blank = e;
}
assert.ok(blank);
assert.strictEqual(blank.code, 'trade.missing_trail');

var zero;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'SELL',
    amount: '10',
    price: '100',
    trail: '0',
    mark: '100'
  });
} catch (e) {
  zero = e;
}
assert.ok(zero);
assert.strictEqual(zero.code, 'trade.missing_trail');

var missingMark;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'trailing_stop',
    side: 'SELL',
    amount: '10',
    price: '100',
    trail: '5'
  });
} catch (e) {
  missingMark = e;
}
assert.ok(missingMark);
assert.strictEqual(missingMark.code, 'trade.missing_mark');
assert.strictEqual(
  missingMark.message,
  'a trailing stop walks with the mark; trade does not invent a mark'
);

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.notStrictEqual(gtc.type, 'trailing_stop');
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'trail'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'mark'), false);

var missMsg = tradeWire.orderFailureMessage({ reason: 'missing_trail' }, 'place');
assert.ok(missMsg.indexOf('does not invent a distance') !== -1);
assert.ok(missMsg.indexOf('No order was placed.') !== -1);

var missMsgTrade = tradeWire.orderFailureMessage({ reason: 'trade.missing_trail' }, 'place');
assert.ok(missMsgTrade.indexOf('does not invent a distance') !== -1);

var markMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_mark' }, 'place');
assert.ok(markMsg.indexOf('does not invent a mark') !== -1);

assert.strictEqual(typeof tsTicket.installBazaarTrailingStopTicket, 'function');
assert.strictEqual(tsTicket.installBazaarTrailingStopTicket(null), false);
assert.strictEqual(tsTicket.readTicketTrailing({}), false);
assert.strictEqual(tsTicket.readTicketTrailing({ type: 'trailing_stop' }), true);
assert.strictEqual(tsTicket.readTicketTrailing({ trail: '5' }), true);

console.log('ix-trailing-stop-ticket golden: PASS');
