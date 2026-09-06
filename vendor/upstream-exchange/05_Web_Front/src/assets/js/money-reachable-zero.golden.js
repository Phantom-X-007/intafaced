#!/usr/bin/env node
/**
 * remaining-SOT §19.7.5 — reachable-zero vs empty vs failed on /uc/money.
 *
 * HTTP 503 → unknown/degraded. Empty `balances: {}` → empty. Wire decimal
 * string `"0"` → a live row printed as a string, not empty, not failed, not
 * `$0` as a JS number.
 *
 * Named live fixture still owed. This golden does not seed balances.
 *
 * Run: node src/assets/js/money-reachable-zero.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var wire = require(path.join(__dirname, 'ix-wire.js'));
var trade = require(path.join(__dirname, 'ix-trade.js'));

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

var money = fs.readFileSync(path.join(__dirname, '../../components/uc/MoneyIndex.vue'), 'utf8');
var i18n = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function classify(httpOk, payload) {
  if (!httpOk) return 'unknown';
  var gate = trade.accept(trade.schemas.balances, payload);
  if (!gate.ok) return 'unknown';
  var rows = trade.toBalanceRows(gate.data);
  if (!rows.length) return 'empty';
  return 'live';
}

/* ── HTTP 503 / failed read → unknown/degraded, never empty, never $0 ───── */
assert(classify(false, { balances: {} }) === 'unknown', 'HTTP not-ok (503) is unknown, not empty');
assert(
  classify(false, { balances: { USDT: { free: '0', used: '0', total: '0' } } }) === 'unknown',
  'HTTP not-ok ignores a zero payload — not reachable-zero, not live'
);
assert(money.indexOf('if (!res.ok)') !== -1, 'MoneyIndex branches on !res.ok');
assert(money.indexOf('Authenticated · degraded') !== -1, '503/failed copy is degraded');
assert(money.indexOf('is-degraded') !== -1, 'failed read paints is-degraded');
assert(money.indexOf('unknown, not zero') !== -1, 'failed read copy is unknown, not zero');
assert(money.indexOf('walletError = this.refusalCopy(res)') !== -1, 'failed read stores refusal, not rows');

/* ── empty list → empty ──────────────────────────────────────────────────── */
var emptyPayload = { balances: {} };
assert(wire.validate(wire.balances, emptyPayload).ok === true, 'empty balances object is a valid success');
assert(trade.accept(trade.schemas.balances, emptyPayload).ok === true, 'accept empty balances');
assert(trade.toBalanceRows(emptyPayload).length === 0, 'empty balances object → no rows');
assert(classify(true, emptyPayload) === 'empty', 'reachable empty list is empty, not unknown');
assert(money.indexOf("v-if=\"!tableMoneyShow.length\"") !== -1, 'empty table is a named state, not a $0 table');
assert(money.indexOf('Ledger reachable') !== -1, 'empty success is reachable, not degraded');
assert(money.indexOf("this.$t('intafaced.trade.noBalances')") !== -1, 'empty uses noBalances copy');
assert(
  i18n.indexOf('The ledger holds no balance for this account yet') !== -1,
  'noBalances names no rows, not rounded-to-zero'
);

/* ── decimal-string "0" from the wire → reachable-zero row ───────────────── */
var zeroPayload = { balances: { USDT: { free: '0', used: '0', total: '0' } } };
var zeroGate = trade.accept(trade.schemas.balances, zeroPayload);
assert(zeroGate.ok === true, 'wire "0" strings pass the balances shape');
var zeroRows = trade.toBalanceRows(zeroGate.data);
assert(zeroRows.length === 1, 'wire "0" is a row, not empty');
assert(classify(true, zeroPayload) === 'live', 'wire "0" is live/reachable-zero, not empty, not unknown');
assert(zeroRows[0].unit === 'USDT', 'zero row keeps the asset');
assert(zeroRows[0].free === '0', 'free is the decimal string "0"');
assert(typeof zeroRows[0].free === 'string', 'free stays a string — not JS number 0');
assert(zeroRows[0].used === '0' && typeof zeroRows[0].used === 'string', 'used stays string "0"');
assert(zeroRows[0].total === '0' && typeof zeroRows[0].total === 'string', 'total stays string "0"');
assert(zeroRows[0].free !== 0, 'free is not the JS number 0');
assert(money.indexOf('return String(value)') !== -1, 'MoneyIndex prints decimals as strings');
assert(money.indexOf('{{ decimal(row.balance) }}') !== -1, 'reachable-zero prints through decimal()');
assert(money.indexOf('<div v-else class="ix-money-table-wrap">') !== -1, 'non-empty rows including "0" take the table, not empty');

/* JSON number 0 is unknown, never a table of $0 */
var numericZero = { balances: { USDT: { free: 0, used: 0, total: 0 } } };
assert(wire.validate(wire.balances, numericZero).ok === false, 'JSON number 0 is refused');
assert(classify(true, numericZero) === 'unknown', 'numeric 0 is unknown, not reachable-zero');
assert(money.indexOf('Shape failure') !== -1, 'shape failure is unknown, never a table');

/* MoneyIndex must not parse money into a JS number */
assert(money.indexOf('parseFloat') === -1, 'MoneyIndex has no parseFloat');
assert(money.indexOf('Number(') === -1, 'MoneyIndex has no Number(');
var templateEnd = money.indexOf('</template>');
var template = templateEnd === -1 ? money : money.slice(0, templateEnd);
assert(template.indexOf('$0') === -1, 'template does not paint $0');
assert(template.indexOf('{{ 0 }}') === -1, 'template does not paint a JS zero');

if (failed) {
  console.error('money-reachable-zero.golden: ' + failed + ' failed');
  process.exit(1);
}
console.log('money-reachable-zero.golden: ok');
