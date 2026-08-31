/* OCO place ticket — linked TP+SL through trade; no invented trigger. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var ocoTicket = require('./ix-oco-ticket.js');

var ocoBody = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTC',
  takeProfit: { stopPrice: '110.00' },
  stopLoss: { stopPrice: '90.00' },
  mark: '50'
});
assert.strictEqual(ocoBody.oco, true);
assert.strictEqual(ocoBody.takeProfit, '110.00');
assert.strictEqual(ocoBody.stopLoss, '90.00');
assert.strictEqual(ocoBody.timeInForce, 'GTC');
assert.strictEqual(Object.prototype.hasOwnProperty.call(ocoBody, 'mark'), false);

var withAmount = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '0.5',
  price: '100',
  oco: true,
  takeProfit: '110',
  stopLoss: '90'
});
assert.strictEqual(withAmount.oco, true);
assert.strictEqual(withAmount.takeProfit, '110');
assert.strictEqual(withAmount.stopLoss, '90');

function refuseOco(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missing = refuseOco({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  takeProfit: { stopPrice: '110.00' }
});
assert.ok(missing);
assert.strictEqual(missing.code, 'trade.missing_oco_trigger');

var blank = refuseOco({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  takeProfit: { stopPrice: '' },
  stopLoss: { stopPrice: '90.00' }
});
assert.ok(blank);
assert.strictEqual(blank.code, 'trade.missing_oco_trigger');

var missTp = refuseOco({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '1',
  price: '110',
  oco: true,
  stopLoss: '90',
  mark: '50'
});
assert.ok(missTp);
assert.strictEqual(missTp.code, 'trade.missing_oco_trigger');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'oco'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'takeProfit'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'stopLoss'), false);

var msg = tradeWire.orderFailureMessage({ reason: 'trade.missing_oco_trigger' }, 'place');
assert.ok(msg.indexOf('does not invent a trigger') !== -1);
assert.ok(msg.indexOf('No order was placed.') !== -1);

assert.strictEqual(typeof ocoTicket.installBazaarOcoTicket, 'function');
assert.strictEqual(ocoTicket.installBazaarOcoTicket(null), false);
assert.strictEqual(ocoTicket.readTicketOcoPlace({}), false);
assert.strictEqual(ocoTicket.readTicketOcoPlace({ oco: true }), true);
assert.strictEqual(ocoTicket.readTicketOcoPlace({ take: true, takeProfit: '110', stopLoss: '90' }), false);
assert.strictEqual(ocoTicket.readTicketOcoPlace({ type: 'option', takeProfit: '110', stopLoss: '90' }), false);
assert.strictEqual(ocoTicket.leftoverStatus({ status: 'open' }), 'open');
assert.strictEqual(ocoTicket.leftoverStatus(null), null);

console.log('ix-oco-ticket golden: PASS');
