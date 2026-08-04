/**
 * ix-money — decimal arithmetic for the trading desk. No IEEE float on money.
 *
 * WHY THIS FILE EXISTS. ix-trade.js has always claimed that "the value that
 * goes back out to POST /api/v1/orders is the string the user typed, never a
 * round-tripped float". That claim was false in two places on the order ticket:
 * clicking a book row ran the venue's price through parseFloat().toFixed() and
 * dropped the result into form.price, and the percent slider computed a size as
 * (balance * percent / 100) / price in float and dropped THAT into form.amount.
 * Both then went out on the wire as the string of a float. `toFixed` also
 * ROUNDS, so a price of 1.45 shown at one decimal place became 1.5 — a price
 * the venue never quoted, on the buy button.
 *
 * This module is the desk's equivalent of apps/web/src/lib/money.ts, which does
 * the same job with a scaled bigint. BigInt is not available here: this tree is
 * outside the pnpm workspace (so `@intafaced/*` cannot resolve) and is bundled
 * by webpack 3 / babel-loader 7 with no babel config, which cannot parse `0n`.
 * bignumber.js is already vendored beside this file and withdraw-math.js
 * already proves the shape; this generalises it for the rest of the desk.
 *
 * THE RULES, WHICH ARE THE POINT
 *
 * 1. TRUNCATE, NEVER ROUND. Every scale reduction is ROUND_DOWN (toward zero).
 *    Rounding a price up invents a quote; rounding a size up invents balance.
 *
 * 2. PARSE FAILURE IS null, NEVER 0. A zero returned for an unreadable value is
 *    a fabricated number that reads exactly like a real one. Callers decide how
 *    to say "unknown" — usually a dash.
 *
 * 3. PAD TO THE MARKET'S OWN PRECISION. A book where one row reads 68412.5 and
 *    the next 68412.45 cannot be scanned. Padding is string surgery on the
 *    digits, never `Number.prototype.toFixed`.
 *
 * 4. A CUMULATIVE COLUMN ACCUMULATES IN BigNumber. A depth ladder is nothing
 *    but running sums, and 0.1 + 0.2 is wrong in the last place on every row
 *    below the top one.
 *
 * 5. THE ONLY LEGITIMATE FLOAT IS A CSS RATIO. `ratio()` below is a bar width;
 *    no user reads it as a quantity. It scales in decimal FIRST so the lossy
 *    division is the last operation rather than the first. `toFloat()` is the
 *    named escape hatch for sorting and comparison — it is never a value that
 *    gets rendered or sent.
 *
 * CommonJS, matching book-honesty.js / ix-trade.js / withdraw-math.js beside
 * it, so the golden tests can require() this without a bundler.
 *
 * Golden tests: node src/assets/js/ix-money.golden.js
 */
'use strict';

function createIxMoney(BigNumber) {
  if (typeof BigNumber !== 'function') {
    throw new Error('createIxMoney requires the BigNumber constructor');
  }

  /* Same configuration withdraw-math.js sets, on purpose: both modules share
     one global BigNumber constructor and whichever loads last must not change
     the other's behaviour. Every rounding call below ALSO passes ROUND_DOWN
     explicitly and every string comes out of toFixed(), which never uses
     exponential notation — so nothing here depends on this global state. */
  BigNumber.config({
    DECIMAL_PLACES: 40,
    ROUNDING_MODE: BigNumber.ROUND_DOWN,
    EXPONENTIAL_AT: [-20, 40]
  });

  var DOWN = BigNumber.ROUND_DOWN;

  /** A usable decimal-place count: an integer 0–18, the range the venue quotes in. */
  function isScale(dp) {
    var s = Number(dp);
    return isFinite(s) && s === Math.floor(s) && s >= 0 && s <= 18;
  }

  /**
   * A value from the wire, the DOM or the form → BigNumber, or null.
   *
   * Null in, null out. "abc" in, null out. Nothing here ever answers zero for a
   * value it could not read.
   *
   * @param {string|number|null|undefined} v
   * @returns {BigNumber|null}
   */
  function toBN(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && !isFinite(v)) return null;
    try {
      var bn = new BigNumber(String(v).trim());
      if (!bn.isFinite() || bn.isNaN()) return null;
      return bn;
    } catch (e) {
      return null;
    }
  }

  /** BigNumber → string at `dp` places (ROUND_DOWN), or full precision when dp is not a scale. */
  function fixed(bn, dp) {
    if (bn === null) return null;
    if (!isScale(dp)) return bn.toFixed();
    return bn.decimalPlaces(Number(dp), DOWN).toFixed(Number(dp));
  }

  /**
   * Fixed decimal places, truncated and padded. The column-scannable form.
   *
   * TRUNCATES. `(1.45).toFixed(1)` is "1.5"; this is "1.4". The venue quoted
   * 1.45 and 1.5 is a price that does not exist.
   *
   * @returns {string|null} null when the value is unreadable — never "0.00"
   */
  function toFixedString(value, dp) {
    return fixed(toBN(value), dp);
  }

  /**
   * Thousands separators, inserted into the digit string. No locale number path,
   * because `toLocaleString` takes a float and hands back whatever it rounded to.
   *
   * @param {string|number|null} text a decimal string (usually from toFixedString)
   * @returns {string|null}
   */
  function group(text) {
    if (text === null || text === undefined || text === '') return null;
    var s = String(text);
    var negative = s.charAt(0) === '-';
    var abs = negative ? s.slice(1) : s;
    var dot = abs.indexOf('.');
    var whole = dot < 0 ? abs : abs.slice(0, dot);
    var frac = dot < 0 ? null : abs.slice(dot + 1);
    if (whole === '') whole = '0';
    var grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-' : '') + grouped + (frac === null ? '' : '.' + frac);
  }

  /** Grouped + padded display string, or null. */
  function display(value, dp) {
    return group(toFixedString(value, dp));
  }

  /**
   * How many decimal places a market quotes at, from its tick or lot size.
   * Precision is a property of the market, not of the renderer. "0.01" → 2.
   * @returns {number|null}
   */
  function decimalsOf(sizeString) {
    if (sizeString === null || sizeString === undefined || sizeString === '') return null;
    var text = String(sizeString);
    var dot = text.indexOf('.');
    if (dot < 0) return 0;
    return text.slice(dot + 1).replace(/0+$/, '').length;
  }

  /* ── exact arithmetic: decimal string in, decimal string out ───────────── */

  function add(a, b) {
    var x = toBN(a);
    var y = toBN(b);
    if (x === null || y === null) return null;
    return x.plus(y).toFixed();
  }

  function subtract(a, b) {
    var x = toBN(a);
    var y = toBN(b);
    if (x === null || y === null) return null;
    return x.minus(y).toFixed();
  }

  function multiply(a, b, dp) {
    var x = toBN(a);
    var y = toBN(b);
    if (x === null || y === null) return null;
    return fixed(x.times(y), dp);
  }

  /**
   * a ÷ b, truncated to `dp`. Null when b is missing, zero or negative — a
   * quotient by a price we do not have is not a number, and it is certainly
   * not zero.
   */
  function divide(a, b, dp) {
    var x = toBN(a);
    var y = toBN(b);
    if (x === null || y === null || !y.isGreaterThan(0)) return null;
    return fixed(x.dividedBy(y), dp);
  }

  /** `value` × `percent` / 100, truncated to `dp`. */
  function percentOf(value, percent, dp) {
    var v = toBN(value);
    var p = toBN(percent);
    if (v === null || p === null) return null;
    return fixed(v.times(p).dividedBy(100), dp);
  }

  /* ── predicates ────────────────────────────────────────────────────────── */

  function isPositive(value) {
    var bn = toBN(value);
    return bn !== null && bn.isGreaterThan(0);
  }

  /** -1 / 0 / 1, or null when either side is unreadable. Never guesses an order. */
  function compare(a, b) {
    var x = toBN(a);
    var y = toBN(b);
    if (x === null || y === null) return null;
    return x.comparedTo(y);
  }

  /** Is `a` strictly greater than `b`? False (not an exception) when unknown. */
  function greaterThan(a, b) {
    var c = compare(a, b);
    return c !== null && c > 0;
  }

  /* ── the two places a float is allowed ─────────────────────────────────── */

  /**
   * Ratio of one amount to another as a 0–1 float, FOR A CSS LENGTH ONLY.
   *
   * Legitimately a float: it is a bar width and no user reads it as a quantity.
   * Scaled in decimal first so the division that loses precision is the last
   * operation rather than the first.
   */
  function ratio(part, whole) {
    var p = toBN(part);
    var w = toBN(whole);
    if (p === null || w === null || !w.isGreaterThan(0)) return 0;
    var scaled = p.times(10000).dividedBy(w).integerValue(DOWN).toNumber();
    if (!isFinite(scaled)) return 0;
    return Math.min(Math.max(scaled / 10000, 0), 1);
  }

  /**
   * The lossy escape hatch, named so it can be grepped.
   *
   * For sorting, ordering and "is this bigger than that" ONLY. The result must
   * never be rendered and must never reach the wire — it is a float, and every
   * reason this file exists applies to it. Null (not 0) when unreadable.
   *
   * @returns {number|null}
   */
  function toFloat(value) {
    var bn = toBN(value);
    if (bn === null) return null;
    var n = bn.toNumber();
    return isFinite(n) ? n : null;
  }

  /* ── the order ticket ──────────────────────────────────────────────────── */

  /**
   * The value a clicked book row puts into the price input.
   *
   * The venue's own decimal string, truncated and padded to the market's price
   * precision — NOT parseFloat(price).toFixed(scale), which is what used to run
   * here and which both rounds and re-encodes through a binary double before
   * the string goes back out to POST /orders.
   *
   * @returns {string|null} null for a level that is not real depth
   */
  function bookPriceForForm(price, dp) {
    var bn = toBN(price);
    if (bn === null || !bn.isGreaterThan(0)) return null;
    return fixed(bn, dp);
  }

  /**
   * The order size behind the 25/50/75/100% buttons.
   *
   * budget = balance × percent ÷ 100, then optionally ÷ price, truncated to the
   * market's amount precision. Every step is BigNumber: a 100% sell has to come
   * out as a size the ledger's own balance can actually cover, and a float
   * multiply-then-divide is how it ends up one ulp over and rejected — or one
   * ulp under and quietly leaving dust.
   *
   * @param {{ balance: *, percent: *, scale: number, divideBy?: * }} opts
   *   `divideBy` is the limit price for a base-sized buy; omit it when the
   *   budget is already denominated in the asset being sized.
   * @returns {string|null} null when any input is unknown — never "" masquerading
   *   as a computed zero, and never a size against a balance that does not exist
   */
  function percentSize(opts) {
    opts = opts || {};
    var balance = toBN(opts.balance);
    var percent = toBN(opts.percent);
    if (balance === null || percent === null) return null;
    if (!balance.isGreaterThan(0) || !percent.isGreaterThan(0)) return null;
    if (percent.isGreaterThan(100)) return null;
    if (!isScale(opts.scale)) return null;

    var budget = balance.times(percent).dividedBy(100);
    var scale = Number(opts.scale);

    if (opts.divideBy === undefined || opts.divideBy === null || opts.divideBy === '') {
      return budget.decimalPlaces(scale, DOWN).toFixed(scale);
    }
    var price = toBN(opts.divideBy);
    if (price === null || !price.isGreaterThan(0)) return null;
    return budget.dividedBy(price).decimalPlaces(scale, DOWN).toFixed(scale);
  }

  return {
    toBN: toBN,
    isScale: isScale,
    toFixedString: toFixedString,
    group: group,
    display: display,
    decimalsOf: decimalsOf,
    add: add,
    subtract: subtract,
    multiply: multiply,
    divide: divide,
    percentOf: percentOf,
    isPositive: isPositive,
    compare: compare,
    greaterThan: greaterThan,
    ratio: ratio,
    toFloat: toFloat,
    bookPriceForForm: bookPriceForForm,
    percentSize: percentSize
  };
}

var BigNumberCtor = null;
try {
  // Webpack / Node both resolve UMD as the constructor (or .default).
  // eslint-disable-next-line global-require
  var loaded = require('./bignumber.min.js');
  BigNumberCtor = loaded && loaded.default ? loaded.default : loaded;
} catch (e) {
  BigNumberCtor = null;
}

var defaultMoney = BigNumberCtor ? createIxMoney(BigNumberCtor) : null;

module.exports = {
  createIxMoney: createIxMoney,
  toBN: defaultMoney ? defaultMoney.toBN : null,
  isScale: defaultMoney ? defaultMoney.isScale : null,
  toFixedString: defaultMoney ? defaultMoney.toFixedString : null,
  group: defaultMoney ? defaultMoney.group : null,
  display: defaultMoney ? defaultMoney.display : null,
  decimalsOf: defaultMoney ? defaultMoney.decimalsOf : null,
  add: defaultMoney ? defaultMoney.add : null,
  subtract: defaultMoney ? defaultMoney.subtract : null,
  multiply: defaultMoney ? defaultMoney.multiply : null,
  divide: defaultMoney ? defaultMoney.divide : null,
  percentOf: defaultMoney ? defaultMoney.percentOf : null,
  isPositive: defaultMoney ? defaultMoney.isPositive : null,
  compare: defaultMoney ? defaultMoney.compare : null,
  greaterThan: defaultMoney ? defaultMoney.greaterThan : null,
  ratio: defaultMoney ? defaultMoney.ratio : null,
  toFloat: defaultMoney ? defaultMoney.toFloat : null,
  bookPriceForForm: defaultMoney ? defaultMoney.bookPriceForForm : null,
  percentSize: defaultMoney ? defaultMoney.percentSize : null
};
