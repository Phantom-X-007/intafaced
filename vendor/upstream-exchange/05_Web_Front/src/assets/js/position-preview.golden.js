/* Fail-first golden for B6 server-authored perps risk preview. */
'use strict';

const fs = require('fs');
const path = require('path');

const preview = require('./position-preview.js');
const exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');

const input = preview.toRequest({
  symbol: 'FIX/SETTLE',
  side: 'BUY',
  size: '2.5000',
  leverage: '4',
});
if (!input.ok) throw new Error('B6 request builder refused valid decimal strings');
if (JSON.stringify(input.body) !== JSON.stringify({
  symbol: 'FIX/SETTLE',
  side: 'long',
  size: '2.5000',
  leverage: '4',
  marginMode: 'isolated',
})) throw new Error('B6 request body drifted or authored server fields');

for (const bad of [
  { symbol: 'FIX/SETTLE', side: 'BUY', size: 2.5, leverage: '4' },
  { symbol: 'FIX/SETTLE', side: 'BUY', size: '2.5', leverage: 4 },
  { symbol: 'FIX/SETTLE', side: 'BUY', size: '2.5', leverage: '' },
]) {
  if (preview.toRequest(bad).ok) throw new Error('B6 accepted non-string or missing money input');
}

const accepted = preview.acceptResponse({
  symbol: 'FIX/SETTLE', side: 'long', size: '2.5', leverage: '4', marginMode: 'isolated',
  markPrice: '100', markSource: 'depth', leverageCap: '5', orderValue: '250',
  initialMargin: '62.5', estimatedFee: '0.05', liquidationPrice: null,
  orderable: false,
  refusals: [{ code: 'trade.position_preview_liquidation_unavailable', field: 'liquidationPrice', message: 'owner policy unavailable' }],
});
if (!accepted.ok || accepted.data.liquidationPrice !== null || accepted.data.orderable !== false) {
  throw new Error('B6 did not preserve server null/refusal semantics');
}
if (preview.acceptResponse(Object.assign({}, accepted.data, { markPrice: 100 })).ok) {
  throw new Error('B6 accepted JSON-number money from the server');
}
const unavailable = preview.acceptResponse({
  symbol: 'FIX/SETTLE', side: 'long', size: '2.5', leverage: '4', marginMode: 'isolated',
  markPrice: null, markSource: null, leverageCap: null, orderValue: null,
  initialMargin: null, estimatedFee: null, liquidationPrice: null, orderable: false,
  refusals: [
    { code: 'trade.leverage_cap_unset', field: 'leverage', message: 'cap unavailable' },
    { code: 'trade.position_preview_mark_unavailable', field: 'markPrice', message: 'mark unavailable' },
    { code: 'trade.position_preview_liquidation_unavailable', field: 'liquidationPrice', message: 'policy unavailable' },
  ],
});
if (!unavailable.ok || unavailable.data.markPrice !== null || unavailable.data.leverageCap !== null) {
  throw new Error('B6 collapsed unavailable server fields into values');
}

for (const marker of [
  "rest('/positions/preview'",
  'v-model="positionLeverage"',
  'positionPreview.markPrice',
  'positionPreview.initialMargin',
  'positionPreview.estimatedFee',
  'positionPreview.liquidationPrice',
  'positionPreview.refusals',
  'positionPreviewMarkSourceLabel',
  "return this.isPerpKind && this.orderType !== 'tpsl' && (this.orderType === 'twap' || !this.reduceOnly)",
  "return !this.isPerpKind && this.orderType === 'MARKET_PRICE' && this.side === 'BUY'",
  'const seq = ++this._positionPreviewSeq',
  'loadPositionPreview(request.body, seq)',
]) {
  if (!exchange.includes(marker)) throw new Error(`B6 Exchange wiring missing: ${marker}`);
}
for (const forbidden of ['positionLeverage: \'10\'', 'liquidationPrice =', 'markPrice: this.', 'Number(this.positionLeverage)']) {
  if (exchange.includes(forbidden)) throw new Error(`B6 Exchange wiring forbids: ${forbidden}`);
}
const amountField = exchange.indexOf('id="ix-ticket-amount"');
const leverageField = exchange.indexOf('id="ix-ticket-leverage"');
if (amountField < 0 || leverageField < amountField || exchange.indexOf('id="ix-ticket-leverage"', leverageField + 1) !== -1) {
  throw new Error('B6 leverage must appear exactly once inside the order ticket after size');
}
const previewMethods = exchange.slice(exchange.indexOf('positionPreviewValue(value)'), exchange.indexOf('/** Public depth stream'));
for (const forbidden of ['Number(', 'parseFloat(', 'maintenanceRatio', 'maintenanceMargin']) {
  if (previewMethods.includes(forbidden)) throw new Error(`B6 preview methods forbid client risk math: ${forbidden}`);
}

console.log('position-preview golden: PASS');
