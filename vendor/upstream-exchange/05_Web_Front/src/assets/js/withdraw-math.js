/**
 * Withdraw net arithmetic — decimal strings only, never IEEE float.
 *
 * Uses bignumber.js (UMD under ./bignumber.min.js). ROUND_DOWN so the UI never
 * promises more net than amount − fee after scale truncation.
 *
 * Golden tests: node src/assets/js/withdraw-math.golden.js
 * (from 05_Web_Front cwd, or any path that can require these files).
 */
'use strict';

function createWithdrawMath(BigNumber) {
  if (typeof BigNumber !== 'function') {
    throw new Error('createWithdrawMath requires the BigNumber constructor');
  }

  BigNumber.config({
    DECIMAL_PLACES: 40,
    ROUNDING_MODE: BigNumber.ROUND_DOWN,
    EXPONENTIAL_AT: [-20, 40]
  });

  function toBN(v) {
    if (v === null || v === undefined || v === '') return null;
    try {
      var bn = new BigNumber(String(v));
      if (!bn.isFinite() || bn.isNaN()) return null;
      return bn;
    } catch (e) {
      return null;
    }
  }

  /**
   * Net the user is told they will receive.
   *
   * @param {string|number} amount  Gross withdraw amount
   * @param {string|number} fee     Network / venue fee
   * @param {number} scale          withdrawScale (integer decimals, 0–18)
   * @returns {{
   *   ok: boolean,
   *   net: string|null,
   *   error: string|null,
   *   amount: string|null,
   *   fee: string|null
   * }}
   */
  function netReceive(amount, fee, scale) {
    var a = toBN(amount);
    var f = toBN(fee);
    var s = Number(scale);

    if (a === null || f === null) {
      return {
        ok: false,
        net: null,
        error: 'invalid_amount_or_fee',
        amount: null,
        fee: null
      };
    }
    if (!Number.isFinite(s) || s !== Math.floor(s) || s < 0 || s > 18) {
      return {
        ok: false,
        net: null,
        error: 'invalid_scale',
        amount: a.toFixed(),
        fee: f.toFixed()
      };
    }
    if (a.isNegative() || f.isNegative()) {
      return {
        ok: false,
        net: null,
        error: 'negative_not_allowed',
        amount: a.toFixed(),
        fee: f.toFixed()
      };
    }

    var net = a.minus(f);
    if (net.isNegative()) {
      return {
        ok: false,
        net: null,
        error: 'fee_exceeds_amount',
        amount: a.toFixed(),
        fee: f.toFixed()
      };
    }

    var rounded = net.decimalPlaces(s, BigNumber.ROUND_DOWN);
    return {
      ok: true,
      net: rounded.toFixed(s),
      error: null,
      amount: a.toFixed(),
      fee: f.toFixed()
    };
  }

  /**
   * Format a money-ish value to a fixed scale string for display (ROUND_DOWN).
   * Returns null when input is unusable — never invents "0.00".
   */
  function formatAmount(value, scale) {
    var bn = toBN(value);
    var s = Number(scale);
    if (bn === null) return null;
    if (!Number.isFinite(s) || s !== Math.floor(s) || s < 0 || s > 18) {
      return bn.toFixed();
    }
    return bn.decimalPlaces(s, BigNumber.ROUND_DOWN).toFixed(s);
  }

  return {
    netReceive: netReceive,
    formatAmount: formatAmount,
    toBN: toBN
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

var defaultMath = BigNumberCtor ? createWithdrawMath(BigNumberCtor) : null;

module.exports = {
  createWithdrawMath: createWithdrawMath,
  netReceive: defaultMath ? defaultMath.netReceive : null,
  formatAmount: defaultMath ? defaultMath.formatAmount : null,
  toBN: defaultMath ? defaultMath.toBN : null
};
