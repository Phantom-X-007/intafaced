/* Fail-first golden for server-authored spot order preview on the Bazaar desk. */
'use strict';

const fs = require('fs');
const path = require('path');

const preview = require('./spot-order-preview.js');
const exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');

const input = preview.toRequest({
  symbol: 'FIX/QUOTE',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '2.5000',
  price: '100.00',
  timeInForce: 'GTC'
});
if (!input.ok) throw new Error('spot preview request builder refused valid decimal strings');
if (JSON.stringify(input.body) !== JSON.stringify({
  symbol: 'FIX/QUOTE',
  side: 'buy',
  type: 'limit',
  amount: '2.5000',
  timeInForce: 'GTC',
  price: '100.00'
})) throw new Error('spot preview request body drifted or authored server fields');

const market = preview.toRequest({
  symbol: 'FIX/QUOTE',
  side: 'SELL',
  type: 'MARKET_PRICE',
  amount: '1',
  timeInForce: 'IOC'
});
if (!market.ok || market.body.price !== undefined || market.body.type !== 'market') {
  throw new Error('spot market preview must omit price');
}

const stop = preview.toRequest({
  symbol: 'FIX/QUOTE',
  side: 'BUY',
  type: 'stop',
  amount: '2',
  stopPrice: '90'
});
if (!stop.ok || stop.body.type !== 'stop' || stop.body.stopPrice !== '90') {
  throw new Error('spot stop preview must stay on the wire so the venue can refuse-closed');
}

for (const bad of [
  { symbol: 'FIX/QUOTE', side: 'BUY', type: 'LIMIT_PRICE', amount: 2.5, price: '100' },
  { symbol: 'FIX/QUOTE', side: 'BUY', type: 'LIMIT_PRICE', amount: '2.5', price: 100 },
  { symbol: 'FIX/QUOTE', side: 'BUY', type: 'LIMIT_PRICE', amount: '2.5', price: '' },
  { symbol: 'FIX/QUOTE', side: 'BUY', type: 'MARKET_PRICE', amount: '2.5', price: '100' },
  { symbol: 'FIX/QUOTE', side: 'BUY', type: 'twap', amount: '2.5' },
  { symbol: 'FIX/QUOTE', side: 'BUY', type: 'LIMIT_PRICE', amount: '2.5', price: '100', reduceOnly: true }
]) {
  if (preview.toRequest(bad).ok) throw new Error('spot preview accepted non-string money, market+price, or unsupported type');
}

const accepted = preview.acceptResponse({
  symbol: 'FIX/QUOTE', side: 'buy', type: 'limit', amount: '2.5', price: '100', timeInForce: 'GTC',
  holdAsset: 'QUOTE', holdAmount: '250', protectionPrice: null,
  estimatedFee: '0.0005', feeAsset: 'FIX', feeBps: 2, feeRole: 'taker',
  orderable: false,
  refusals: [{ code: 'trade.market_halted', field: 'symbol', message: 'market halted' }]
});
if (!accepted.ok || accepted.data.holdAmount !== '250' || accepted.data.orderable !== false) {
  throw new Error('spot preview did not preserve server hold/refusal semantics');
}
if (preview.acceptResponse(Object.assign({}, accepted.data, { holdAmount: 250 })).ok) {
  throw new Error('spot preview accepted JSON-number money from the server');
}

const unavailable = preview.acceptResponse({
  symbol: 'FIX/QUOTE', side: 'buy', type: 'stop', amount: '2', price: null, timeInForce: 'GTC',
  holdAsset: null, holdAmount: null, protectionPrice: null,
  estimatedFee: null, feeAsset: null, feeBps: null, feeRole: null,
  orderable: false,
  refusals: [{ code: 'trade.order_type_unsupported', field: 'type', message: 'stop is not supported on spot' }]
});
if (!unavailable.ok || unavailable.data.holdAmount !== null || unavailable.data.estimatedFee !== null) {
  throw new Error('spot preview collapsed stop/TP refusal into invented hold or fee');
}

const marketSell = preview.acceptResponse({
  symbol: 'FIX/QUOTE', side: 'sell', type: 'market', amount: '2', price: null, timeInForce: 'IOC',
  holdAsset: 'FIX', holdAmount: '2', protectionPrice: null,
  estimatedFee: null, feeAsset: null, feeBps: 2, feeRole: 'taker',
  orderable: true,
  refusals: []
});
if (!marketSell.ok || marketSell.data.estimatedFee !== null || marketSell.data.orderable !== true) {
  throw new Error('spot preview must keep a null fee when the venue did not name one');
}

if (preview.acceptResponse(Object.assign({}, marketSell.data, { orderable: true, refusals: [{ code: 'x', field: 'type', message: 'no' }] })).ok) {
  throw new Error('spot preview accepted orderable with refusals');
}

for (const marker of [
  "rest('/orders/preview'",
  'spotOrderPreviewRequired',
  'spotOrderPreview.holdAmount',
  'spotOrderPreview.estimatedFee',
  'spotOrderPreview.refusals',
  'const seq = ++this._spotOrderPreviewSeq',
  'loadSpotOrderPreview(request.body, seq)',
  "return this.deskMode === 'spot' && !this.isPerpKind && !this.amendOrder &&",
  "this.orderType !== 'twap' && this.orderType !== 'scale' && this.orderType !== 'tpsl'"
]) {
  if (!exchange.includes(marker)) throw new Error(`spot preview Exchange wiring missing: ${marker}`);
}
for (const forbidden of ['holdAmount: this.', 'estimatedFee: this.symbolFee', 'Number(this.form.amount)']) {
  if (exchange.includes(forbidden)) throw new Error(`spot preview Exchange wiring forbids: ${forbidden}`);
}

const previewMethods = exchange.slice(exchange.indexOf('loadSpotOrderPreview(body, seq)'), exchange.indexOf('/** Public depth stream'));
if (previewMethods.length < 40) throw new Error('spot preview methods missing');
for (const forbidden of ['Number(', 'parseFloat(', 'symbolFee *', 'holdFor(']) {
  if (previewMethods.includes(forbidden)) throw new Error(`spot preview methods forbid client money math: ${forbidden}`);
}

const gtd = preview.toRequest({
  symbol: 'FIX/QUOTE',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTD',
  expireAt: '2026-08-26T12:00:00.000Z'
});
if (!gtd.ok || gtd.body.timeInForce !== 'GTD' || gtd.body.expireAt !== '2026-08-26T12:00:00.000Z') {
  throw new Error('spot preview must rest GTD with caller expireAt');
}
const missing = preview.toRequest({
  symbol: 'FIX/QUOTE',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTT'
});
if (missing.ok || missing.reason !== 'expireAt') {
  throw new Error('spot preview must refuse GTD/GTT without expireAt');
}
const gtc = preview.toRequest({
  symbol: 'FIX/QUOTE',
  side: 'BUY',
  type: 'LIMIT_PRICE',
  amount: '1.25',
  price: '100.10',
  timeInForce: 'GTC'
});
if (!gtc.ok || Object.prototype.hasOwnProperty.call(gtc.body, 'expireAt')) {
  throw new Error('spot preview must not invent expireAt on GTC');
}

console.log('spot-order-preview golden: PASS');
