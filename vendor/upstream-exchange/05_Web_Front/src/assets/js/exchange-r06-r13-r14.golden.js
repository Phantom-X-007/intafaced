#!/usr/bin/env node
/**
 * R06 isolated IM/liq from GET /positions · R13 no invented EMS tree ·
 * R14 instrument-borne expiry + existing next-funding. No Greeks, MM math,
 * calendars, or price alerts.
 *
 * Run: node src/assets/js/exchange-r06-r13-r14.golden.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var trade = require('./ix-trade.js');
var wire = require('./ix-wire.js');

var root = path.join(__dirname, '../../');
var exchange = fs.readFileSync(path.join(root, 'pages/exchange/Exchange.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var tradeSrc = fs.readFileSync(path.join(__dirname, 'ix-trade.js'), 'utf8');

function has(source, needle, label) {
  assert.notStrictEqual(source.indexOf(needle), -1, (label || needle) + ' missing');
}

function absent(source, needle, label) {
  assert.strictEqual(source.indexOf(needle), -1, (label || needle) + ' must stay unwired');
}

/* ── R14: listing expiryDatetime passes through; ms expiry does not invent ISO */
var dated = trade.toMarketRow(
  {
    symbol: 'BTC/USDT:USDT-251226',
    base: 'BTC',
    quote: 'USDT',
    expiryDatetime: '2025-12-26T00:00:00.000Z',
    expiry: 1766707200000
  },
  {}
);
assert.strictEqual(dated.expiryDatetime, '2025-12-26T00:00:00.000Z');

var perp = trade.toMarketRow({ symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT' }, {});
assert.strictEqual(perp.expiryDatetime, null);

var msOnly = trade.toMarketRow({ symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', expiry: 1766707200000 }, {});
assert.strictEqual(msOnly.expiryDatetime, null);

var emptyIso = trade.toMarketRow({ symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', expiryDatetime: '' }, {});
assert.strictEqual(emptyIso.expiryDatetime, null);

ok(
  wire.markets,
  [{ symbol: 'BTC/USDT', expiryDatetime: '2025-12-26T00:00:00.000Z' }],
  'markets accept ISO expiryDatetime'
);
rejects(wire.markets, [{ symbol: 'BTC/USDT', expiryDatetime: 1766707200000 }], 'markets refuse ms as expiryDatetime', 'expiryDatetime');

function ok(schema, value, name) {
  var r = wire.validate(schema, value);
  assert.strictEqual(r.ok, true, name + ' (pass) ' + (r.message || ''));
}
function rejects(schema, value, name, pathHint) {
  var r = wire.validate(schema, value);
  assert.strictEqual(r.ok, false, name + ' (reject)');
  if (pathHint) {
    assert.ok(
      String(r.path || '').indexOf(pathHint) !== -1 || String(r.message || '').indexOf(pathHint) !== -1,
      name + ' names ' + pathHint
    );
  }
}

has(exchange, 'v-if="currentCoin.expiryDatetime"', 'quiet expiry on pair header');
has(exchange, "futuresTickerValue(futuresTicker.nextFundingTime)", 'next-funding already on ticker strip');
has(lang, 'expiry: "Expiry"', 'en expiry label');

/* ── R06: isolated IM + existing liq from position wire; no MM math */
has(exchange, 'nullableDecimal(row.initialMargin)', 'positions gate IM as decimal-or-null');
has(exchange, "exchange.hlplus.initialMargin", 'positions table IM header');
has(exchange, 'isolatedInitialMargin(row)', 'isolated IM cell');
has(exchange, 'positionValue(row.liquidationPrice)', 'liq already on blotter');
has(lang, 'initialMargin: "Initial margin"', 'en IM label');
absent(exchange, 'maintenanceMargin', 'R06 does not invent MM');
absent(exchange, 'maintenanceRatio', 'R06 does not invent MM ratio');
assert.ok(!/Number\(\s*row\.initialMargin/.test(exchange), 'IM stays a string');

/* ── R13: listLiveEmsChildren is admin tRPC, not the desk REST wire */
absent(exchange, 'listLiveEmsChildren', 'R13 no EMS tree invent');
absent(exchange, 'liveChildren', 'R13 no liveChildren fetch');
absent(exchange, 'execution.oms.liveChildren', 'R13 not on desk tRPC');

/* ── R14 refuse: no calendar / alerts / Greeks */
absent(exchange, 'econ calendar', 'no econ calendar');
absent(exchange, 'priceAlert', 'no price alerts');
absent(exchange, 'price alert', 'no price alert copy');
absent(tradeSrc, 'Greeks', 'no invented Greeks');

console.log('exchange-r06-r13-r14.golden: ok');
