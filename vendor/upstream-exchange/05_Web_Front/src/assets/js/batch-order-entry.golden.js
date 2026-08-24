#!/usr/bin/env node
'use strict';

/* Executable contract checks for the Bazaar professional batch entry slice. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var batch = require('./ix-batch-order.js');
var trade = require('./ix-trade.js');

function body(id, amount, price) {
  return trade.toCreateOrderBody({
    symbol: 'BTC/USDT',
    type: price === null ? 'MARKET_PRICE' : 'LIMIT_PRICE',
    side: 'BUY',
    amount: amount,
    price: price,
    timeInForce: 'GTC',
    clientOrderId: id
  });
}

var precise = body('stable-1', '0.000000000000000001', '12345.670000000000000001');
var draft = batch.createDraft(precise);
assert.strictEqual(draft.body.amount, '0.000000000000000001', 'amount must remain a decimal string');
assert.strictEqual(draft.body.price, '12345.670000000000000001', 'price must remain a decimal string');
assert.strictEqual(draft.clientOrderId, 'stable-1');
assert.strictEqual(batch.createDraft(precise).clientOrderId, 'stable-1', 'draft identity is stable');
assert.strictEqual(batch.fingerprint(draft.body), batch.fingerprint(precise));

var ordered = [
  batch.createDraft(body('first', '1.5', '100.25')),
  batch.createDraft(body('second', '0.25', null)),
  batch.createDraft(body('third', '2', '101'))
];
var payload = batch.buildPayload(ordered);
assert.strictEqual(payload.ok, true);
assert.deepStrictEqual(payload.payload.orders.map(function (row) { return row.clientOrderId; }), ['first', 'second', 'third']);
assert.strictEqual(payload.payload.orders[0].amount, '1.5');
assert.strictEqual(payload.payload.orders[0].price, '100.25');

var mixed = batch.classifyResponse({ ok: true, status: 200, data: { results: [
  { index: 0, clientOrderId: 'first', status: 'success', order: { clientOrderId: 'first' } },
  { index: 1, clientOrderId: 'second', status: 'refused', error: { message: 'disabled' } },
  { index: 2, clientOrderId: 'third', status: 'unknown', error: { intafacedCode: 'trade.batch_outcome_unknown' } }
] } }, ordered);
assert.deepStrictEqual(mixed.items.map(function (row) { return [row.clientOrderId, row.status]; }), [
  ['first', 'accepted'], ['second', 'refused'], ['third', 'unknown']
], 'mixed results stay in staged order');

var oneHundred = [];
for (var i = 0; i < batch.MAX_BATCH_ORDERS; i += 1) {
  oneHundred.push(batch.createDraft(body('cap-' + i, '1', '100')));
}
assert.strictEqual(batch.validateDrafts(oneHundred).ok, true, 'origin/main cap is inclusive at 100');
assert.strictEqual(batch.validateDrafts(oneHundred.concat([batch.createDraft(body('cap-over', '1', '100'))])).reason, 'cap');

var duplicate = batch.validateDrafts([batch.createDraft(body('dup', '1', '100')), batch.createDraft(body('dup', '2', '101'))]);
assert.strictEqual(duplicate.ok, false);
assert.strictEqual(duplicate.reason, 'duplicate_id', 'duplicate IDs refuse before transport');

var unknown = batch.classifyResponse({ ok: false, reason: 'unreachable', status: 0 }, ordered);
assert.strictEqual(unknown.kind, 'unknown');
assert.deepStrictEqual(unknown.items.map(function (row) { return row.clientOrderId; }), ['first', 'second', 'third']);
assert.strictEqual(unknown.items.every(function (row) { return row.status === 'unknown'; }), true);
var serverUnknown = batch.classifyResponse({ ok: false, status: 503, message: 'gateway down' }, ordered);
assert.strictEqual(serverUnknown.kind, 'unknown');
var forbidden = batch.classifyResponse({ ok: false, status: 403, reason: 'forbidden', message: 'scope denied' }, ordered);
assert.strictEqual(forbidden.kind, 'refused');
assert.strictEqual(forbidden.items.every(function (row) { return row.status === 'refused'; }), true);

var malformed = batch.classifyResponse({ ok: true, status: 200, data: { results: [{ clientOrderId: 'wrong', status: 'success' }] } }, ordered);
assert.strictEqual(malformed.kind, 'unknown', 'mismatched response IDs require reconciliation');

var page = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
[
  "rest('/orders/batch'",
  'stageCurrentBatchOrder',
  'submitBatchOrders',
  'pendingBatchOutcome',
  'reconcilePendingBatchFromRows',
  'MAX_BATCH_ORDERS'
].forEach(function (needle) {
  assert.notStrictEqual(page.indexOf(needle), -1, 'Exchange.vue missing ' + needle);
});
assert.strictEqual(/Number\s*\(\s*this\.form\.(amount|price)/.test(page), false, 'batch stage cannot route economics through Number()');

console.log('batch-order-entry golden: PASS');
