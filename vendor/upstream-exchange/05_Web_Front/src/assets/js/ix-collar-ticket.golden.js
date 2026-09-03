/* Collar ticket wire — caller min/max only; no invented last or mid. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
require('./ix-collar-ticket.js');

var body = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  collar: true,
  min: '90',
  max: '110'
});
assert.strictEqual(body.collar, true);
assert.strictEqual(body.min, '90');
assert.strictEqual(body.max, '110');

var missing;
try {
  tradeWire.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: 'LIMIT_PRICE',
    side: 'BUY',
    amount: '1',
    price: '100',
    collar: true
  });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.missing_collar');

console.log('ix-collar-ticket.golden: ok');
