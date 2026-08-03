/**
 * A-UI-2 — pure honesty helpers for the vendor exchange desk.
 * Never invent depth; never claim empty when the market did not answer;
 * never treat a non-zero API envelope as a placed order.
 *
 * CommonJS so desk-hotkeys-style golden tests can require() without a bundler.
 */
'use strict';

var ixMoney = require('./ix-money.js');

/**
 * Side empty-state copy for the order book ladder.
 * @param {{ loading?: boolean, reachable?: boolean, side?: string }} opts
 * @returns {string}
 */
function bookSideEmptyLabel(opts) {
  opts = opts || {};
  if (opts.loading) {
    return 'Loading order book…';
  }
  if (!opts.reachable) {
    return 'Book unavailable — market did not respond';
  }
  return opts.side === 'asks' ? 'No asks' : 'No bids';
}

/**
 * Trades tape empty-state copy.
 * @param {{ loading?: boolean, reachable?: boolean }} opts
 * @returns {string}
 */
function tradesEmptyLabel(opts) {
  opts = opts || {};
  if (opts.loading) {
    return 'Loading trades…';
  }
  if (!opts.reachable) {
    return 'Trades unavailable — market did not respond';
  }
  return 'No trades yet';
}

/**
 * Keep only real book levels. Zero / missing price or amount is not depth.
 * Does not pad to a fixed height — empty ladder is an empty ladder.
 *
 * DECIMAL STRINGS, AND THE CUMULATIVE COLUMN IS THE REASON.
 *
 * `price` and `amount` come back as the venue's own decimal strings, and
 * `totalAmount` is a BigNumber running sum rendered as one. This used to take a
 * `num` callback, coerce both columns to floats and accumulate `total += amount`
 * — and a depth ladder is nothing but cumulative sums, so every row below the
 * top one was wrong in its last place. Ten 0.1 levels totalled
 * 0.9999999999999999. The renderer pads these strings for display; nothing here
 * hands a float to anything.
 *
 * @param {Array<{price?: *, amount?: *}>|null|undefined} items
 * @param {number} maxDepth
 * @returns {Array<{price: string, amount: string, totalAmount: string}>}
 */
function normalizePlateLevels(items, maxDepth) {
  var list = Array.isArray(items) ? items : [];
  var limit = maxDepth > 0 ? maxDepth : list.length;
  var rows = [];
  var total = '0';
  for (var i = 0; i < list.length && rows.length < limit; i++) {
    var item = list[i] || {};
    if (!ixMoney.isPositive(item.price) || !ixMoney.isPositive(item.amount)) {
      continue;
    }
    var amount = ixMoney.toFixedString(item.amount);
    var next = ixMoney.add(total, amount);
    /* isPositive already proved both parse; a null here would mean the module
       is mis-wired, and a ladder with a hole in its running total is worse than
       a short ladder. */
    if (next === null) {
      continue;
    }
    total = next;
    rows.push({
      price: ixMoney.toFixedString(item.price),
      amount: amount,
      totalAmount: total
    });
  }
  return rows;
}

/**
 * Format a venue MessageResult-style envelope after placeOrder.
 * Success (code == 0) → empty string (caller shows success UI).
 * Anything else → human message that never implies the order was placed.
 * @param {*} body
 * @returns {string} empty when success; reject copy otherwise
 */
function formatOrderRejectEnvelope(body) {
  if (body == null) {
    return 'The exchange did not respond. Your order was not placed.';
  }
  /* Loose equality matches Vue desk style (code may be string "0"). */
  if (body.code == 0) {
    return '';
  }
  var msg = body.message != null && String(body.message).trim() !== ''
    ? String(body.message).trim()
    : '';
  if (!msg) {
    if (body.code != null && body.code !== '') {
      msg = 'Order rejected (code ' + body.code + ')';
    } else {
      msg = 'Unknown error';
    }
  }
  if (body.code == 4000 || /login|session|auth|token/i.test(msg)) {
    return 'Session invalid — sign in again. Order was not placed. (' + msg + ')';
  }
  if (!/not placed|was not placed|rejected|failed/i.test(msg)) {
    return msg + ' — order was not placed.';
  }
  return msg;
}

module.exports = {
  bookSideEmptyLabel: bookSideEmptyLabel,
  tradesEmptyLabel: tradesEmptyLabel,
  normalizePlateLevels: normalizePlateLevels,
  formatOrderRejectEnvelope: formatOrderRejectEnvelope
};
