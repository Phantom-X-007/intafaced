/**
 * A-UI-SUB — pure helpers for the sub-accounts selector on the vendor desk.
 *
 * Identity owns catalogue rows (list/create/revoke). Money routing across
 * sub-accounts is SHEHZAD (H-ID-SUB / M5) — this module never invents balances
 * and never claims trade/order/balance scoping is ready.
 *
 * CommonJS so golden tests can require() without a bundler.
 * Golden: node src/assets/js/sub-accounts.golden.js  (from 05_Web_Front cwd)
 */
'use strict';

/** Sentinel for the parent (main) book — never a UUID from identity. */
var PARENT_ID = null;

/**
 * Trade path under a sub-account is NOT wired on the vendor shell.
 * Orders still hit the venue wallet as the parent; selecting a sub must not
 * pretend money moved. Flip only when H-ID-SUB + placeOrder UI path land.
 */
var TRADE_ROUTING_READY = false;

/**
 * Normalize identity `subAccounts.list` rows. Drops junk; never invents labels.
 * @param {Array<{id?: *, label?: *, purpose?: *, revoked?: *, createdAt?: *}>|null|undefined} rows
 * @returns {Array<{id: string, label: string, purpose: string|null, revoked: boolean, createdAt: string|null}>}
 */
function normalizeList(rows) {
  if (!Array.isArray(rows)) return [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r || r.id == null || r.id === '') continue;
    var id = String(r.id);
    // UUIDs only — refuse garbage that could look like a book id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      continue;
    }
    var label = r.label != null && String(r.label).trim() ? String(r.label).trim() : id.slice(0, 8);
    out.push({
      id: id,
      label: label,
      purpose: r.purpose != null && r.purpose !== '' ? String(r.purpose) : null,
      revoked: r.revoked === true,
      createdAt: r.createdAt != null ? String(r.createdAt) : null
    });
  }
  return out;
}

/**
 * Options for a selector: parent first, then active (non-revoked) subs.
 * Revoked rows are omitted from the switcher (still may appear in a management list later).
 * @param {ReturnType<normalizeList>} rows
 * @returns {Array<{id: string|null, label: string, revoked: boolean, isParent: boolean}>}
 */
function selectorOptions(rows) {
  var opts = [{ id: PARENT_ID, label: 'Parent account', revoked: false, isParent: true }];
  var list = normalizeList(rows);
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    if (r.revoked) continue;
    opts.push({
      id: r.id,
      label: r.label,
      revoked: false,
      isParent: false
    });
  }
  return opts;
}

/**
 * Whether the current selection may place a venue order from this shell.
 * Parent always may (subject to login/market gates elsewhere).
 * Sub-account selection blocks until TRADE_ROUTING_READY.
 * @param {string|null|undefined} selectedId
 * @returns {boolean}
 */
function canPlaceOrder(selectedId) {
  if (selectedId == null || selectedId === '' || selectedId === PARENT_ID) {
    return true;
  }
  return TRADE_ROUTING_READY === true;
}

/**
 * Human block reason when trade is disabled by sub-account selection.
 * Empty string when not blocked by this layer.
 * @param {string|null|undefined} selectedId
 * @returns {string}
 */
function tradeBlockReason(selectedId) {
  if (canPlaceOrder(selectedId)) return '';
  return (
    'Sub-account selected — order routing under a sub-account is not wired yet ' +
    '(identity money graph · not this UI). Switch to Parent account to trade on the venue wallet.'
  );
}

/**
 * Compact trigger label for the header control.
 * @param {string|null|undefined} selectedId
 * @param {ReturnType<normalizeList>} rows
 * @returns {string}
 */
function triggerLabel(selectedId, rows) {
  if (selectedId == null || selectedId === '' || selectedId === PARENT_ID) {
    return 'Parent';
  }
  var list = normalizeList(rows);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === selectedId) return list[i].label;
  }
  // Selection points at a missing/revoked row — do not invent a live book
  return 'Unknown sub-account';
}

/**
 * Status copy for honesty strip under the control.
 * @param {{ hasToken?: boolean, loading?: boolean, reason?: string|null, list?: Array, selectedId?: string|null }} state
 * @returns {string}
 */
function statusNote(state) {
  state = state || {};
  if (!state.hasToken) {
    return 'Sub-accounts need a platform session (Platform → sign in). Venue login alone is not enough.';
  }
  if (state.loading) {
    return 'Loading sub-accounts…';
  }
  if (state.reason && state.reason !== 'ok') {
    return 'Sub-account list unavailable — not empty. Reason: ' + state.reason + '.';
  }
  var list = normalizeList(state.list);
  var active = 0;
  for (var i = 0; i < list.length; i++) {
    if (!list[i].revoked) active += 1;
  }
  if (active === 0) {
    return 'No sub-accounts yet · parent only. Catalogue is identity; balances are never invented here.';
  }
  if (!canPlaceOrder(state.selectedId)) {
    return tradeBlockReason(state.selectedId);
  }
  return active + ' sub-account' + (active === 1 ? '' : 's') + ' · trade stays on parent until money routing ships.';
}

/**
 * Coerce a stored selection against a fresh list.
 * Missing/revoked selection falls back to parent (null).
 * @param {string|null|undefined} selectedId
 * @param {ReturnType<normalizeList>} rows
 * @returns {string|null}
 */
function coerceSelection(selectedId, rows) {
  if (selectedId == null || selectedId === '' || selectedId === PARENT_ID) {
    return PARENT_ID;
  }
  var list = normalizeList(rows);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === selectedId && !list[i].revoked) {
      return list[i].id;
    }
  }
  return PARENT_ID;
}

module.exports = {
  PARENT_ID: PARENT_ID,
  TRADE_ROUTING_READY: TRADE_ROUTING_READY,
  normalizeList: normalizeList,
  selectorOptions: selectorOptions,
  canPlaceOrder: canPlaceOrder,
  tradeBlockReason: tradeBlockReason,
  triggerLabel: triggerLabel,
  statusNote: statusNote,
  coerceSelection: coerceSelection
};
