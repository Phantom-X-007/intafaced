/**
 * Market-order impact estimate — decimal walk of top-of-book.
 *
 * The desk used to walk levels with IEEE float (`px * qty`, `cost / filled`)
 * then paint the average via `fmt(avg)`. That invents an average price the
 * venue never printed. Walk in ix-money (BigNumber) instead; only the CSS-safe
 * slip *ratio* may touch float at the last step, and even that is formatted
 * as a percent label, never as a money charge.
 *
 * Pure CommonJS so goldens can require() without webpack.
 *
 * Golden: node src/assets/js/ix-market-impact.golden.js
 */
'use strict';

/**
 * @param {object} opts
 * @param {string|number|null|undefined} opts.size order size (base qty, or quote when quoteSized)
 * @param {boolean} [opts.quoteSized=false]
 * @param {Array<{price:*, amount:*}>} opts.levels book levels, best first
 * @param {string|number|null|undefined} opts.mid last / mid for slip
 * @param {'BUY'|'SELL'|string} opts.side
 * @param {number|null|undefined} opts.scale quote precision for avg print
 * @param {object} opts.money ix-money module (or createIxMoney instance shape)
 * @returns {{ok:false, reason:string}|{ok:true, avg:string, slipPct:string|null, partial:boolean}}
 */
function estimateMarketImpact(opts) {
  var money = opts && opts.money;
  if (!money || typeof money.toBN !== 'function') {
    return { ok: false, reason: 'no-money' };
  }
  if (!opts || !Array.isArray(opts.levels) || opts.levels.length === 0) {
    return { ok: false, reason: 'no-depth' };
  }
  var sizeBn = money.toBN(opts.size);
  if (sizeBn === null || !money.isPositive(opts.size)) {
    return { ok: false, reason: 'bad-size' };
  }

  var quoteSized = !!opts.quoteSized;
  var remain = sizeBn;
  var cost = money.toBN('0');
  var filled = money.toBN('0');
  var zero = money.toBN('0');

  for (var i = 0; i < opts.levels.length; i++) {
    if (money.compare(remain, '0') <= 0) break;
    var row = opts.levels[i] || {};
    var px = money.toBN(row.price);
    var qty = money.toBN(row.amount);
    if (px === null || qty === null) continue;
    if (!money.isPositive(row.price) || !money.isPositive(row.amount)) continue;

    if (quoteSized) {
      /* Market buy amount is quote currency — spend remain quote. */
      var levelQuote = money.multiply(row.price, row.amount);
      if (levelQuote === null) continue;
      var levelQuoteBn = money.toBN(levelQuote);
      var takeQuoteBn =
        money.compare(remain, levelQuote) <= 0 ? remain : levelQuoteBn;
      var takeQuoteStr = takeQuoteBn.toFixed();
      var takeBaseStr = money.divide(takeQuoteStr, row.price);
      if (takeBaseStr === null) continue;
      cost = money.toBN(money.add(cost.toFixed(), takeQuoteStr) || '0');
      filled = money.toBN(money.add(filled.toFixed(), takeBaseStr) || '0');
      remain = money.toBN(money.subtract(remain.toFixed(), takeQuoteStr) || '0');
    } else {
      var takeBn = money.compare(remain, row.amount) <= 0 ? remain : qty;
      var takeStr = takeBn.toFixed();
      var takeCostStr = money.multiply(takeStr, row.price);
      if (takeCostStr === null) continue;
      cost = money.toBN(money.add(cost.toFixed(), takeCostStr) || '0');
      filled = money.toBN(money.add(filled.toFixed(), takeStr) || '0');
      remain = money.toBN(money.subtract(remain.toFixed(), takeStr) || '0');
    }
  }

  if (filled === null || money.compare(filled.toFixed(), '0') <= 0) {
    return { ok: false, reason: 'no-depth' };
  }

  var avg = money.divide(cost.toFixed(), filled.toFixed(), opts.scale);
  if (avg === null) {
    return { ok: false, reason: 'no-depth' };
  }

  var partial = money.compare(remain.toFixed(), '0') > 0;
  var slipPct = null;
  var midBn = money.toBN(opts.mid);
  if (midBn !== null && money.isPositive(opts.mid)) {
    var side = String(opts.side || '').toUpperCase();
    var slipAbs =
      side === 'BUY'
        ? money.subtract(avg, opts.mid)
        : money.subtract(opts.mid, avg);
    if (slipAbs !== null) {
      var slipRatio = money.divide(slipAbs, opts.mid);
      if (slipRatio !== null) {
        var pct = money.multiply(slipRatio, '100', 2);
        if (pct !== null) slipPct = pct;
      }
    }
  }

  return {
    ok: true,
    avg: avg,
    slipPct: slipPct,
    partial: partial
  };
}

/**
 * Format estimate for the ticket line. Keys map to i18n; this returns plain
 * fragments so the Vue layer can $t the static pieces.
 */
function formatImpactLabel(est, labels) {
  labels = labels || {};
  if (!est || !est.ok) {
    if (est && est.reason === 'book-unknown') return labels.bookUnknown || 'book unknown';
    if (est && est.reason === 'bad-size') return '';
    return labels.noDepth || 'no depth';
  }
  var avgWord = labels.avg || 'avg';
  var base = avgWord + ' ' + est.avg;
  if (est.slipPct != null) {
    base += ' · ~' + est.slipPct + '%';
  }
  if (est.partial) {
    base += est.slipPct != null ? ' · partial' : ' · partial book';
  }
  return base;
}

module.exports = {
  estimateMarketImpact: estimateMarketImpact,
  formatImpactLabel: formatImpactLabel
};
