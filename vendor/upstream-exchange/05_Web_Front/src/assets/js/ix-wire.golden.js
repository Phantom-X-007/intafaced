#!/usr/bin/env node
/**
 * Golden tests for ix-wire.js — the desk's response contract.
 * Run: node src/assets/js/ix-wire.golden.js
 * Exit 0 = all pass; non-zero = failure (prints every miss).
 *
 * THE POINT. A JSON-number price, a nineteenth decimal place, or a protocol
 * plane answering custodial:true must be REFUSED. These assertions fail if
 * any of those three start passing again — which is how a float reaches the
 * order form or a broken deployment publishes its own custody claim.
 */
'use strict';

var path = require('path');
var wire = require(path.join(__dirname, 'ix-wire.js'));

var failed = 0;

function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) {
    console.error('FAIL', name, 'expected', JSON.stringify(expected), 'got', JSON.stringify(actual));
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

function ok(schema, value, name) {
  var r = wire.validate(schema, value);
  assert(r.ok === true, name + ' (pass)');
}

function rejects(schema, value, name, pathHint) {
  var r = wire.validate(schema, value);
  assert(r.ok === false, name + ' (reject)');
  if (pathHint && r.ok === false) {
    assert(
      String(r.path || '').indexOf(pathHint) !== -1 || String(r.message || '').indexOf(pathHint) !== -1,
      name + ' names ' + pathHint + ' (path=' + r.path + ' msg=' + r.message + ')'
    );
  }
  return r;
}

/* ── decimal primitive ───────────────────────────────────────────────────── */
ok(wire.decimal, '0', 'decimal zero');
ok(wire.decimal, '1.5', 'decimal 1.5');
ok(wire.decimal, '100.123456789012345678', 'decimal 18 places');
rejects(wire.decimal, 42.5, 'decimal refuses JSON number', 'JSON number');
rejects(wire.decimal, '1.1234567890123456789', 'decimal refuses 19 places', '19');
rejects(wire.decimal, '-1', 'unsigned decimal refuses negative');
rejects(wire.decimal, 'abc', 'decimal refuses garbage');
rejects(wire.decimal, '', 'decimal refuses empty string');

ok(wire.signedDecimal, '-0.0142', 'signed decimal allows down move');
rejects(wire.signedDecimal, -0.0142, 'signed decimal refuses JSON number');

/* ── missing schema is a pass (opt-in) ───────────────────────────────────── */
assert(wire.validate(null, { anything: true }).ok === true, 'missing schema passes');
assert(wire.validate(undefined, 1).ok === true, 'undefined schema passes');

/* ── order book: empty is success; float levels are not ──────────────────── */
ok(
  wire.orderBook,
  { bids: [], asks: [], timestamp: 1700000000000 },
  'empty order book is a success'
);
ok(
  wire.orderBook,
  {
    symbol: 'BTC/USDT',
    bids: [['68412.5', '0.1']],
    asks: [['68413.0', '0.2']]
  },
  'order book with decimal string levels'
);
rejects(
  wire.orderBook,
  { bids: [[68412.5, 0.1]], asks: [] },
  'order book refuses float bid price',
  'bids[0][0]'
);
rejects(
  wire.orderBook,
  { bids: [], asks: [['68413', 1]] },
  'order book refuses float ask amount',
  'asks[0][1]'
);

/* ── ticker: last is the form seed — never a float ───────────────────────── */
ok(
  wire.ticker,
  { symbol: 'BTC/USDT', last: null, high: null, percentage: null },
  'ticker null rollups are honest'
);
ok(wire.ticker, { last: '68412.5', percentage: '-1.25' }, 'ticker decimal last + signed pct');
rejects(wire.ticker, { last: 68412.5 }, 'ticker refuses JSON-number last', 'last');

ok(
  wire.tickers,
  { 'BTC/USDT': { last: '1', percentage: null }, 'ETH/USDT': { last: null } },
  'tickers map'
);
rejects(
  wire.tickers,
  { 'BTC/USDT': { last: 1 } },
  'tickers map refuses float last',
  'BTC/USDT.last'
);

/* ── markets: precision dual shape ───────────────────────────────────────── */
ok(
  wire.markets,
  [
    {
      symbol: 'BTC/USDT',
      base: 'BTC',
      quote: 'USDT',
      active: true,
      maker: '0.001',
      taker: '0.001',
      precision: { price: '0.01', amount: '0.0001' },
      limits: { cost: { min: '10' } }
    }
  ],
  'markets TICK_SIZE shape'
);
ok(
  wire.markets,
  [{ symbol: 'ETH/USDT', precision: { price: 5, amount: 4 } }],
  'markets place-count shape (deployed fleet)'
);
rejects(
  wire.markets,
  [{ symbol: 'X', maker: 0.001 }],
  'markets refuses float maker fee',
  'maker'
);
rejects(wire.markets, [{ symbol: '' }], 'markets refuses empty symbol');

/* ── trades / prints ─────────────────────────────────────────────────────── */
ok(
  wire.trades,
  [{ side: 'buy', price: '100', amount: '1', cost: '100', timestamp: 1 }],
  'trades happy path'
);
ok(wire.trades, [], 'empty trades is a success');
rejects(wire.trades, [{ side: 'buy', price: 100, amount: '1' }], 'trades refuse float price', 'price');
rejects(wire.trades, [{ side: 'hold', price: '1', amount: '1' }], 'trades refuse unknown side');

/* ── OHLCV ───────────────────────────────────────────────────────────────── */
ok(wire.ohlcv, [[1700000000000, '1', '2', '0.5', '1.5', '100']], 'ohlcv candle');
rejects(wire.ohlcv, [[1700000000000, 1, 2, 0.5, 1.5, 100]], 'ohlcv refuses float open', '[1]');

/* ── orders ──────────────────────────────────────────────────────────────── */
ok(
  wire.order,
  {
    id: 'ord-1',
    type: 'limit',
    side: 'buy',
    amount: '1',
    filled: '0',
    price: '100',
    cost: null,
    status: 'open'
  },
  'open limit order'
);
ok(
  wire.order,
  {
    id: 'ord-2',
    type: 'market',
    side: 'sell',
    amount: '1',
    filled: '1',
    price: null,
    status: 'closed'
  },
  'market order null price'
);
rejects(
  wire.order,
  {
    id: 'ord-3',
    type: 'limit',
    side: 'buy',
    amount: 1,
    filled: '0',
    status: 'open'
  },
  'order refuses float amount',
  'amount'
);
ok(wire.orders, [], 'empty orders list is a success');

/* ── balances ────────────────────────────────────────────────────────────── */
ok(wire.balances, { balances: {} }, 'empty balances object is a success');
ok(
  wire.balances,
  { balances: { USDT: { free: '10', used: '0', total: '10' } } },
  'balance decimal strings'
);
rejects(
  wire.balances,
  { balances: { USDT: { free: 10, used: 0, total: 10 } } },
  'balances refuse float free',
  'free'
);

/* ── protocol plane: custodial is literal false ──────────────────────────── */
ok(wire.dexHealth, { ok: true, service: 'svc-dex', custodial: false }, 'dex health honest');
rejects(
  wire.dexHealth,
  { ok: true, service: 'svc-dex', custodial: true },
  'dex health refuses custodial:true',
  'custodial'
);
rejects(
  wire.protocolHealth,
  { ok: true, service: 'svc-protocol', custodial: true },
  'protocol health refuses custodial:true',
  'custodial'
);
ok(
  wire.protocolHealth,
  { ok: true, service: 'svc-protocol', custodial: false, chainId: 1 },
  'protocol health honest'
);

/* ── identity ────────────────────────────────────────────────────────────── */
ok(
  wire.session,
  {
    accessToken: 'a',
    refreshToken: 'b',
    expiresAt: '2026-01-01T00:00:00Z',
    userId: '00000000-0000-4000-8000-000000000001'
  },
  'session shape'
);
rejects(
  wire.session,
  {
    accessToken: 'a',
    refreshToken: 'b',
    expiresAt: 'x',
    userId: 'not-a-uuid'
  },
  'session refuses bad userId'
);

/* ── describe names the field ────────────────────────────────────────────── */
var badLast = wire.validate(wire.ticker, { last: 42.5 });
assert(badLast.ok === false, 'describe source fails');
var sentence = wire.describe(badLast);
assert(sentence.indexOf('last') !== -1, 'describe names last');
assert(sentence.indexOf('JSON number') !== -1 || sentence.indexOf('42.5') !== -1, 'describe names the rule');
assertEqual('describe ok is empty', wire.describe(wire.validate(wire.decimal, '1')), '');

/* ══ MUTATION: the three lies this file exists to catch ════════════════════ */

/* 1. A float last price used to seed form.price in Exchange.vue. */
var legacyFloatLast = { last: 68412.12345678901 };
assert(typeof legacyFloatLast.last === 'number', 'MUTATION fixture is a JSON number');
rejects(wire.ticker, legacyFloatLast, 'MUTATION float last cannot pass', 'last');

/* 2. Nineteenth place is ledger-illegal precision. */
var overlong = '1.' + new Array(20).join('0') + '1';
assert(overlong.split('.')[1].length >= 19, 'MUTATION fixture has ≥19 places');
rejects(wire.decimal, overlong, 'MUTATION 19dp money cannot pass');

/* 3. custodial:true on a sovereign plane must never render. */
rejects(
  wire.dexHealth,
  { ok: true, service: 'svc-dex', custodial: true },
  'MUTATION custodial true cannot pass'
);

if (failed > 0) {
  console.error('\n' + failed + ' golden test(s) failed');
  process.exit(1);
}
console.log('\nall ix-wire golden tests passed');
process.exit(0);
