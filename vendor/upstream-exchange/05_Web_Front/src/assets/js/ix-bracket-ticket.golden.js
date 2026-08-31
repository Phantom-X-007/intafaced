/* Bracket place ticket — linked entry+TP+SL through trade; no invented trigger. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var bracketTicket = require('./ix-bracket-ticket.js');

var body = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100.10',
  timeInForce: 'GTC',
  bracket: true,
  takeProfit: { stopPrice: '110.00' },
  stopLoss: { stopPrice: '90.00' },
  mark: '50'
});
assert.strictEqual(body.bracket, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'oco'), false);
assert.strictEqual(body.takeProfit, '110.00');
assert.strictEqual(body.stopLoss, '90.00');
assert.strictEqual(body.timeInForce, 'GTC');
assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'mark'), false);

var withAmount = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '0.5',
  price: '100',
  bracket: true,
  takeProfit: '110',
  stopLoss: '90'
});
assert.strictEqual(withAmount.bracket, true);
assert.strictEqual(withAmount.takeProfit, '110');
assert.strictEqual(withAmount.stopLoss, '90');

function refuseBracket(input) {
  var err;
  try {
    tradeWire.toCreateOrderBody(input);
  } catch (e) {
    err = e;
  }
  return err;
}

var missTp = refuseBracket({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  bracket: true,
  stopLoss: '90',
  mark: '50'
});
assert.ok(missTp);
assert.strictEqual(missTp.code, 'trade.missing_stop_price');

var missSl = refuseBracket({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  bracket: true,
  takeProfit: '110'
});
assert.ok(missSl);
assert.strictEqual(missSl.code, 'trade.missing_stop_price');

var missEntry = refuseBracket({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  bracket: true,
  takeProfit: '110',
  stopLoss: '90'
});
assert.ok(missEntry);
assert.strictEqual(missEntry.code, 'trade.missing_price');

var gtc = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '1',
  price: '100',
  timeInForce: 'GTC'
});
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'bracket'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'takeProfit'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'stopLoss'), false);

var oco = tradeWire.toCreateOrderBody({
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'SELL',
  amount: '1',
  price: '110',
  oco: true,
  takeProfit: '110',
  stopLoss: '90'
});
assert.strictEqual(oco.oco, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(oco, 'bracket'), false);

var tpMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_stop_price' }, 'place');
assert.ok(tpMsg.indexOf('bracket') !== -1);
assert.ok(tpMsg.indexOf('does not invent a trigger') !== -1);
assert.ok(tpMsg.indexOf('No order was placed.') !== -1);

var entryMsg = tradeWire.orderFailureMessage({ reason: 'trade.missing_price' }, 'place');
assert.ok(entryMsg.indexOf('entry') !== -1);
assert.ok(entryMsg.indexOf('does not invent a trigger') !== -1);

assert.strictEqual(typeof bracketTicket.installBazaarBracketTicket, 'function');
assert.strictEqual(bracketTicket.installBazaarBracketTicket(null), false);
assert.strictEqual(bracketTicket.readTicketBracketPlace({}), false);
assert.strictEqual(bracketTicket.readTicketBracketPlace({ bracket: true }), true);
assert.strictEqual(bracketTicket.readTicketBracketPlace({ oco: true, bracket: true }), false);
assert.strictEqual(bracketTicket.readTicketBracketPlace({ take: true, bracket: true }), false);
assert.strictEqual(bracketTicket.readTicketBracketPlace({ type: 'option', bracket: true }), false);
assert.strictEqual(bracketTicket.readTicketBracketPlace({ takeProfit: '110', stopLoss: '90' }), false);
assert.strictEqual(bracketTicket.leftoverStatus({ status: 'open' }), 'open');
assert.strictEqual(bracketTicket.leftoverStatus(null), null);

console.log('ix-bracket-ticket golden: PASS');
