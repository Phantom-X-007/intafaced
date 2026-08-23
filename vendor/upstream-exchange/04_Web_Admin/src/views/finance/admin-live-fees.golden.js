/*
 * Fail-first golden for G2: the Fees screen must show the canonical svc-trade
 * published schedule, preserving decimal strings and refusing an unset reply.
 * Run with: node src/views/finance/admin-live-fees.golden.js
 */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'FeeManage.vue'), 'utf8');

const required = [
  "'/api/v1/admin/fees'",
  'maker',
  'taker',
  'feeSchedule',
  'feeScheduleUnavailable',
  'configured decimal strings',
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`G2 golden missing marker: ${marker}`);
}
if (/Number\s*\(/.test(source)) throw new Error('G2 golden forbids numeric fee coercion');
if (/0\.1\s*%|0\.001/.test(source)) throw new Error('G2 golden forbids invented fee defaults');
if (/service\/http/.test(source)) throw new Error('G2 golden forbids the legacy remote admin transport');
if (!source.includes('fee.symbol !== symbol') || !source.includes('fee schedule row refused')) {
  throw new Error('G2 golden requires whole-response refusal for a malformed canonical row');
}

console.log('admin-live-fees golden: PASS');
