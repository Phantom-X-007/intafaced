#!/usr/bin/env node
/**
 * Golden: remaining-SOT §19.6 M08 margin modes + M10 dated futures / hedge.
 *
 * M08: 2×2 is four named products (isolated|cross × standard|portfolio),
 * not a checkbox. Isolated-only note is not that. Refuse Cross / portfolio
 * margin / 2×2 when those doors are unset. Do not invent a working mode switch.
 *
 * M10: Perps tab exists. Refuse dated-futures expiry strip and hedge vs
 * one-way when the wire does not return them. Oracle / index stays unknown
 * (`—`) — never a hardcoded number. Host funding indexPrice is hard-null.
 *
 * Run from 05_Web_Front:
 *   node src/assets/js/ix-desk-m08-m10.golden.js
 *
 * Failed ≠ empty ≠ zero. Vue type-strip: this golden may fail LOOK density;
 * do not restyle.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

var helper;
try {
  helper = require('./ix-desk-m08-m10.js');
} catch (e) {
  console.error('FAIL helper missing:', e.message);
  process.exit(1);
}

assert(typeof helper.marginProducts === 'function', 'marginProducts export');
assert(typeof helper.datedFutures === 'function', 'datedFutures export');
assert(typeof helper.hedgeMode === 'function', 'hedgeMode export');
assert(typeof helper.oracleIndexPrice === 'function', 'oracleIndexPrice export');
assert(typeof helper.deskRows === 'function', 'deskRows export');

var FOUR = ['isolated-standard', 'isolated-portfolio', 'cross-standard', 'cross-portfolio'];

function ids(list) {
  return (list || []).map(function (row) {
    return row && row.id;
  });
}

function byId(list, id) {
  var rows = Array.isArray(list) ? list : [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].id === id) return rows[i];
  }
  return null;
}

/* ── M08: four named products, not a checkbox ─────────────────────────── */
var unset = helper.marginProducts({});
assert(Array.isArray(unset) && unset.length === 4, 'unset doors return exactly four named products');
assert(ids(unset).join(',') === FOUR.join(','), '2×2 order is isolated|cross × standard|portfolio');
assert(
  ids(unset).indexOf('two-by-two') === -1 && ids(unset).indexOf('2x2') === -1 && ids(unset).indexOf('2×2') === -1,
  '2×2 is not a checkbox id'
);

var isolated = byId(unset, 'isolated-standard');
assert(isolated && isolated.availability === 'live', 'isolated × standard is the live product');
assert(typeof isolated.label === 'string' && /isolated/i.test(isolated.label) && /standard/i.test(isolated.label), 'live row is named Isolated × standard');
assert(!isolated.reason, 'live isolated-standard has no refuse reason');

;['isolated-portfolio', 'cross-standard', 'cross-portfolio'].forEach(function (id) {
  var row = byId(unset, id);
  assert(row && row.availability === 'unavailable', id + ' is refused when door unset');
  assert(typeof row.reason === 'string' && row.reason.length > 0, id + ' has refuse copy');
  assert(row.reason.indexOf('$0') === -1 && row.reason.indexOf('0.00') === -1, id + ' reason is not $0');
  assert(row.availability !== 'empty' && row.availability !== 'zero' && row.availability !== 'failed', id + ' unavailable ≠ empty ≠ zero ≠ failed');
  assert(row.type !== 'checkbox' && row.kind !== 'flag', id + ' is a named product, not a flag');
});

assert(/cross/i.test(byId(unset, 'cross-standard').reason), 'cross-standard names Cross');
assert(/portfolio/i.test(byId(unset, 'isolated-portfolio').reason), 'isolated-portfolio names portfolio margin');
assert(
  /2\s*[×x]\s*2|four named|not a checkbox/i.test(byId(unset, 'cross-portfolio').reason),
  'cross-portfolio refuse says 2×2 is four named products, not a checkbox'
);

var flagged = helper.marginProducts({ doors: { twoByTwo: true } });
assert(ids(flagged).join(',') === FOUR.join(','), 'twoByTwo flag still returns four named products, not one checkbox');
assert(byId(flagged, 'cross-standard').availability === 'unavailable', '2×2 flag does not invent a live Cross door');
assert(byId(flagged, 'isolated-portfolio').availability === 'unavailable', '2×2 flag does not invent a live PM door');

var crossOn = helper.marginProducts({ doors: { cross: true } });
assert(byId(crossOn, 'cross-standard').availability === 'live', 'Cross × standard goes live only when cross door is set');
assert(byId(crossOn, 'isolated-portfolio').availability === 'unavailable', 'cross door does not invent portfolio margin');
assert(byId(crossOn, 'cross-portfolio').availability === 'unavailable', 'cross without PM is not Cross × portfolio');

var pmOn = helper.marginProducts({ doors: { portfolio: true } });
assert(byId(pmOn, 'isolated-portfolio').availability === 'live', 'Isolated × PM goes live only when portfolio door is set');
assert(byId(pmOn, 'cross-standard').availability === 'unavailable', 'PM door does not invent Cross');
assert(byId(pmOn, 'cross-portfolio').availability === 'unavailable', 'PM without cross is not Cross × portfolio');

var both = helper.marginProducts({ doors: { cross: true, portfolio: true } });
FOUR.forEach(function (id) {
  assert(byId(both, id).availability === 'live', id + ' live when both cross and PM doors are set');
});

assert(
  helper.marginProducts({ doors: { cross: false, portfolio: false } }).every(function (row) {
    return row.id === 'isolated-standard' ? row.availability === 'live' : row.availability === 'unavailable';
  }),
  'explicit false doors stay refused; isolated-standard stays live'
);

/* Isolated-only note is not the 2×2. */
assert(unset.length !== 1, 'isolated-only is not a one-line substitute for four named products');

/* ── M10: dated futures expiry strip ──────────────────────────────────── */
var noDated = helper.datedFutures({});
assert(noDated && noDated.id === 'dated-futures', 'dated-futures row exists');
assert(noDated.availability === 'unavailable', 'dated futures refused when wire is empty');
assert(/expiry strip|future/i.test(noDated.reason), 'dated refuse names expiry strip / future');
assert(!Array.isArray(noDated.expiries) || noDated.expiries.length === 0, 'refused dated strip has no invented expiries');

var perpListing = helper.datedFutures({
  markets: [{ symbol: 'BTC/USDT:USDT', future: false, swap: true, expiryDatetime: '2025-12-26T00:00:00.000Z' }]
});
assert(perpListing.availability === 'unavailable', 'perp listing expiryDatetime is not a dated-futures strip');

var datedLive = helper.datedFutures({
  markets: [
    { symbol: 'BTC/USDT:USDT-251226', future: true, expiryDatetime: '2025-12-26T00:00:00.000Z' },
    { symbol: 'BTC/USDT:USDT', future: false, swap: true }
  ]
});
assert(datedLive.availability === 'live', 'dated futures live only when wire future:true + expiry');
assert(Array.isArray(datedLive.expiries) && datedLive.expiries.length === 1, 'expiry strip lists only dated rows from the wire');
assert(datedLive.expiries[0].expiryDatetime === '2025-12-26T00:00:00.000Z', 'expiry strip uses wire ISO, not invented ms');

var futureNoExpiry = helper.datedFutures({ markets: [{ symbol: 'BTC/USDT:USDT-251226', future: true }] });
assert(futureNoExpiry.availability === 'unavailable', 'future:true without expiry is not an expiry strip');

/* ── M10: hedge vs one-way ────────────────────────────────────────────── */
var noHedge = helper.hedgeMode({});
assert(noHedge && noHedge.id === 'hedge-mode', 'hedge-mode row exists');
assert(noHedge.availability === 'unavailable', 'hedge vs one-way refused when wire has no positionMode');
assert(/hedge|one-way|one way/i.test(noHedge.reason), 'hedge refuse names hedge vs one-way');

assert(helper.hedgeMode({ positions: [{ marginMode: 'isolated' }] }).availability === 'unavailable', 'marginMode isolated is not a hedge switch');
assert(helper.hedgeMode({ positionMode: 'hedge' }).availability === 'live', 'hedge live when wire returns positionMode hedge');
assert(helper.hedgeMode({ positionMode: 'one-way' }).availability === 'live', 'one-way live when wire returns positionMode one-way');
assert(helper.hedgeMode({ positions: [{ positionMode: 'hedge' }] }).availability === 'live', 'hedge live when a position row carries positionMode');

/* ── Oracle / index stays unknown, never a number ─────────────────────── */
var oracleUnset = helper.oracleIndexPrice(undefined);
assert(oracleUnset.availability === 'unknown' && oracleUnset.value === '—', 'missing oracle is unknown em dash');
assert(helper.oracleIndexPrice(null).value === '—', 'null oracle is unknown');
assert(helper.oracleIndexPrice('').value === '—', 'empty oracle is unknown');
assert(helper.oracleIndexPrice(12345).value === '—', 'numeric oracle is refused (would be a hardcoded price)');
assert(helper.oracleIndexPrice(100000.5).value === '—', 'JS number oracle stays —');
assert(helper.oracleIndexPrice('100000').availability === 'live' && helper.oracleIndexPrice('100000').value === '100000', 'decimal-string oracle from the wire may pass through');
assert(helper.oracleIndexPrice('—').value === '—', 'em dash stays unknown');

/* ── Combined desk rows (ticket) ──────────────────────────────────────── */
var desk = helper.deskRows({});
var deskIds = ids(desk);
FOUR.forEach(function (id) {
  assert(deskIds.indexOf(id) !== -1, 'deskRows includes ' + id);
});
assert(deskIds.indexOf('dated-futures') !== -1, 'deskRows includes dated-futures');
assert(deskIds.indexOf('hedge-mode') !== -1, 'deskRows includes hedge-mode');
assert(byId(desk, 'isolated-standard').availability === 'live', 'desk isolated-standard live on unset doors');
assert(byId(desk, 'cross-standard').availability === 'unavailable', 'desk Cross refused on unset doors');
assert(byId(desk, 'dated-futures').availability === 'unavailable', 'desk dated-futures refused without wire');
assert(byId(desk, 'hedge-mode').availability === 'unavailable', 'desk hedge refused without wire');

/* ── Vue: screen or refuse on existing /exchange perp ticket ──────────── */
var vuePath = path.join(__dirname, '../../pages/exchange/Exchange.vue');
var vue = fs.readFileSync(vuePath, 'utf8');
var tradeSrc = fs.readFileSync(path.join(__dirname, 'ix-trade.js'), 'utf8');

assert(/ix-desk-m08-m10\.js/.test(vue), 'Exchange.vue requires ix-desk-m08-m10');
assert(/deskRows\(/.test(vue), 'perp ticket consumes deskRows()');
assert(/isPerpKind/.test(vue) && /ix-empty ix-empty-error/.test(vue), 'perp ticket can render existing ix-empty ix-empty-error');
assert(
  /perpTruthRows|deskM08M10|marginProducts/.test(vue) &&
    /availability === 'unavailable'/.test(vue) &&
    /ix-empty ix-empty-error/.test(vue),
  'unavailable M08/M10 rows render existing ix-empty ix-empty-error'
);

assert(/exchange\.hlplus\.isolatedOnly/.test(vue), 'isolated-only note remains (it is not the 2×2)');
assert(/setDeskKind\('perp'\)/.test(vue) && /exchange\.hlplus\.perps/.test(vue), 'Perps tab already exists — do not invent a route');

assert(
  /oracleIndexPrice[\s\S]{0,80}<dd>—<\/dd>/.test(vue),
  'oracle / index stays hardcoded unknown em dash'
);
assert(!/oracleIndexPrice[\s\S]{0,80}<dd>\{\{/.test(vue), 'oracle dd is not bound to an invented number');
assert(!/indexPrice:\s*markPrice/.test(vue), 'oracle is not copied from mark');

assert(!/v-model="marginMode"/.test(vue), 'no invented working marginMode switch');
assert(!/v-model="positionMode"/.test(vue), 'no invented working hedge/one-way switch');
assert(!/type="checkbox"[\s\S]{0,80}2\s*[×x]\s*2/.test(vue) && !/twoByTwo/.test(vue), '2×2 is not a checkbox on the ticket');

assert(!/2025-12-26/.test(vue), 'Vue does not hardcode a dated expiry');
assert(!/Number\(\s*.*oracle/i.test(vue), 'oracle is not Number()-coerced');

assert(/future:\s*market\.future === true/.test(tradeSrc), 'toMarketRow passes future through from the wire, does not invent it');

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all ix-desk-m08-m10 golden tests passed');
