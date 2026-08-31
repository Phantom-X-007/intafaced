/* OCO cancel ticket — both siblings through trade; no invented trigger. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var cancelTicket = require('./ix-oco-cancel-ticket.js');

var cancelled = tradeWire.toCancelOrderBody({
  cancel: true,
  oco: true,
  orderId: 'parent-1',
  mark: '50',
  takeProfit: '110',
  stopLoss: '90'
});
assert.strictEqual(cancelled.cancel, true);
assert.strictEqual(cancelled.oco, true);
assert.strictEqual(cancelled.orderId, 'parent-1');
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'mark'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'takeProfit'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'stopLoss'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'price'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(cancelled, 'qty'), false);

var placed = tradeWire.toCreateOrderBody({
  cancel: true,
  oco: true,
  orderId: 'parent-1',
  mark: '50'
});
assert.strictEqual(placed.cancel, true);
assert.strictEqual(placed.oco, true);
assert.strictEqual(placed.orderId, 'parent-1');
assert.strictEqual(Object.prototype.hasOwnProperty.call(placed, 'mark'), false);

function refuseCancel(input) {
  var err;
  try {
    tradeWire.toCancelOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missId = refuseCancel({
  cancel: true,
  oco: true,
  mark: '50'
});
assert.ok(missId);
assert.strictEqual(missId.code, 'trade.order_not_found');

var native = tradeWire.toCancelOrderBody({ orderId: 'abc' });
assert.strictEqual(native.orderId, 'abc');
assert.strictEqual(Object.prototype.hasOwnProperty.call(native, 'oco'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(native, 'cancel'), false);

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'cancel'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'oco'), false);

var terminalMsg = tradeWire.orderFailureMessage({ reason: 'trade.oco_sibling_terminal' }, 'cancel');
assert.ok(terminalMsg.indexOf('already terminal') !== -1);
assert.ok(terminalMsg.indexOf('does not invent a trigger') !== -1);
assert.ok(terminalMsg.indexOf('The order was not cancelled.') !== -1);

var shortMsg = tradeWire.orderFailureMessage({ reason: 'oco_sibling_terminal' }, 'cancel');
assert.ok(shortMsg.indexOf('already terminal') !== -1);

assert.strictEqual(typeof cancelTicket.installBazaarOcoCancelTicket, 'function');
assert.strictEqual(cancelTicket.installBazaarOcoCancelTicket(null), false);
assert.strictEqual(cancelTicket.readTicketOcoCancel({}), false);
assert.strictEqual(cancelTicket.readTicketOcoCancel({ cancel: true }), false);
assert.strictEqual(cancelTicket.readTicketOcoCancel({ cancel: true, oco: true }), true);
assert.strictEqual(cancelTicket.readTicketOcoCancel({ take: true, cancel: true, oco: true }), false);
assert.strictEqual(cancelTicket.readTicketOcoCancel({ type: 'option', cancel: true, oco: true }), false);
assert.strictEqual(cancelTicket.leftoverStatus({ status: 'open' }), 'open');
assert.strictEqual(cancelTicket.leftoverStatus({ status: 'CANCELED' }), 'CANCELED');
assert.strictEqual(cancelTicket.leftoverStatus(null), null);

console.log('ix-oco-cancel-ticket golden: PASS');
