/* Close ticket wire — matching owns the net; no invented mark. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var closeTicket = require('./ix-close-ticket.js');

assert.strictEqual(closeTicket.CLOSE_PATH, '/api/v1/spot/positions/close');

var body = closeTicket.toClosePositionBody({
  symbol: 'BTC/USDT',
  clientOrderId: 'close-1'
});
assert.strictEqual(body.symbol, 'BTC/USDT');
assert.strictEqual(body.clientOrderId, 'close-1');
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'qty'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'amount'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'side'), false);

var marked;
try {
  closeTicket.toClosePositionBody({
    symbol: 'BTC/USDT',
    clientOrderId: 'close-2',
    price: '100'
  });
} catch (e) {
  marked = e;
}
assert.ok(marked);
assert.strictEqual(marked.code, 'trade.invalid_qty');

var qty;
try {
  closeTicket.toClosePositionBody({
    symbol: 'BTC/USDT',
    clientOrderId: 'close-3',
    qty: '1'
  });
} catch (e) {
  qty = e;
}
assert.ok(qty);
assert.strictEqual(qty.code, 'trade.invalid_qty');

var missing;
try {
  closeTicket.toClosePositionBody({ symbol: 'BTC/USDT' });
} catch (e) {
  missing = e;
}
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.bad_request');

var msg = tradeWire.orderFailureMessage({ reason: 'trade.position_flat' }, 'close');
assert.ok(msg.indexOf('does not invent a mark') !== -1);
assert.ok(msg.indexOf('The position was not closed.') !== -1);

assert.strictEqual(typeof closeTicket.installBazaarCloseTicket, 'function');
assert.strictEqual(closeTicket.installBazaarCloseTicket(null), false);
assert.strictEqual(closeTicket.wantsClose({}), false);
assert.strictEqual(closeTicket.wantsClose({ closePosition: true }), true);

console.log('ix-close-ticket golden: PASS');
