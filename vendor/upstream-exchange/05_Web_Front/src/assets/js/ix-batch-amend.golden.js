/* Fail-first golden: Bazaar bulk-amend consumes POST /orders/batch-amend; never silent replace. */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var batch = require('./ix-batch-amend.js');

var page = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');
var src = fs.readFileSync(path.join(__dirname, 'ix-batch-amend.js'), 'utf8');

function fail(name) {
  throw new Error(name);
}

var a = batch.createDraft({ orderId: 'ord-1', qty: '1.25' });
var b = batch.createDraft({ orderId: 'ord-2', qty: '0.5' });
var built = batch.buildPayload([a, b]);
if (!built.ok) fail('valid drafts must build');
if (built.payload.amends[0].id !== 'ord-1' || built.payload.amends[0].qty !== '1.25') fail('payload id+qty');
if (Object.prototype.hasOwnProperty.call(built.payload.amends[0], 'price')) fail('payload must not send price');
if (Object.prototype.hasOwnProperty.call(built.payload.amends[0], 'side')) fail('payload must not send side');

if (batch.buildPayload([]).ok) fail('empty must refuse');
if (batch.buildPayload([batch.createDraft({ orderId: 'ord-1', qty: '' })]).ok) fail('blank qty must refuse');
if (batch.buildPayload([batch.createDraft({ orderId: 'ord-1', qty: '0' })]).ok) fail('zero qty must refuse');
if (batch.buildPayload([
  batch.createDraft({ orderId: 'ord-1', qty: '1' }),
  batch.createDraft({ orderId: 'ord-1', qty: '2' })
]).ok) fail('duplicate order id must refuse');
if (batch.validateDrafts([
  { orderId: 'ord-1', qty: '1', price: '101' }
]).ok) fail('price on a draft is cancel/replace, not native batch');

var mixed = batch.classifyResponse({
  ok: true,
  status: 200,
  data: {
    atomic: false,
    results: [
      { index: 0, orderId: 'ord-1', status: 'APPLIED', code: 'AMENDED', path: 'NATIVE_AMEND' },
      { index: 1, orderId: 'ord-2', status: 'REFUSED', code: 'CANCEL_REPLACE', reasonCode: 'trade.amend_price_change', path: 'NATIVE_AMEND' },
      { index: 2, orderId: 'ord-3', status: 'OUTCOME_UNKNOWN', evidence: { outcome: 'OUTCOME_UNKNOWN' } }
    ]
  }
}, [
  batch.createDraft({ orderId: 'ord-1', qty: '1' }),
  batch.createDraft({ orderId: 'ord-2', qty: '1' }),
  batch.createDraft({ orderId: 'ord-3', qty: '1' })
]);
if (mixed.kind !== 'mixed') fail('mixed 200');
if (mixed.items.map(function (row) { return row.status; }).join(',') !== 'applied,refused,unknown') {
  fail('APPLIED/REFUSED/UNKNOWN mapping');
}

var silent = batch.classifyResponse({
  ok: true,
  status: 200,
  data: {
    atomic: false,
    results: [
      { orderId: 'ord-1', status: 'APPLIED', code: 'CANCEL_REPLACE', reasonCode: 'trade.amend_side_change' }
    ]
  }
}, [batch.createDraft({ orderId: 'ord-1', qty: '1' })]);
if (silent.items[0].status !== 'refused') fail('CANCEL_REPLACE must not look applied');

var atomic = batch.classifyResponse({
  ok: true,
  status: 200,
  data: { atomic: true, results: [{ orderId: 'ord-1', status: 'APPLIED' }] }
}, [batch.createDraft({ orderId: 'ord-1', qty: '1' })]);
if (atomic.kind !== 'unknown') fail('atomic claim is unknown, not success');

var timeout = batch.classifyResponse({ ok: false, reason: 'timeout', status: 0 }, [a]);
if (timeout.kind !== 'unknown' || timeout.items[0].status !== 'unknown') fail('timeout is UNKNOWN');

var auth = batch.classifyResponse({ ok: false, status: 401, reason: 'unauthorized', message: 'nope' }, [a]);
if (auth.kind !== 'refused') fail('401 is request-wide refuse');

var scrambled = batch.classifyResponse({
  ok: true,
  status: 200,
  data: { atomic: false, results: [{ orderId: 'other', status: 'APPLIED' }] }
}, [a]);
if (scrambled.kind !== 'unknown') fail('order-id mismatch is unknown');

if (src.indexOf('replaceOrder') !== -1) fail('client must not call replace');
if (src.indexOf('/orders/batch-amend') === -1 && true) {
  /* URL lives on Exchange.vue */
}

[
  "require('../../assets/js/ix-batch-amend.js')",
  'stageCurrentBatchAmend',
  'submitBatchAmends',
  'stagedBatchAmends',
  "/orders/batch-amend"
].forEach(function (marker) {
  if (page.indexOf(marker) === -1) fail('Exchange wiring missing: ' + marker);
});
var submitFn = page.match(/submitBatchAmends\(\) \{[\s\S]*?\n    persistPendingOutcome/);
if (!submitFn) fail('submitBatchAmends method');
if (submitFn[0].indexOf("'/orders/batch-amend'") === -1) fail('submitBatchAmends posts /orders/batch-amend');
if (/method:\s*'PATCH'/.test(submitFn[0])) fail('batch amend must not PATCH per item');
if (submitFn[0].indexOf('submitReplaceAmend') !== -1 || submitFn[0].indexOf('replaceOrder') !== -1) {
  fail('batch amend must not silent-replace');
}
if (submitFn[0].indexOf('toAmendOrderBody') !== -1) {
  fail('batch payload is buildPayload, not single PATCH body');
}

[
  'batchAmendLead',
  'stageBatchAmend',
  'submitBatchAmends',
  'batchAmendNativeOnly',
  'batchAmendMixedResult',
  'batchAmendUnknownCopy'
].forEach(function (key) {
  if (lang.indexOf(key + ':') === -1) fail('en.js missing ' + key);
});

assert.ok(true);
console.log('ix-batch-amend golden: PASS');
