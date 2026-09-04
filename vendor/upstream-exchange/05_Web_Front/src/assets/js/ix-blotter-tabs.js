/**
 * M07 R05 — blotter tab descriptors from desk observations.
 *
 * Live books are the ones Exchange.vue already queries. Missing books
 * (RFQ, borrow, strategies, transfers, errors) are explicit UNAVAILABLE
 * until a real desk REST query is observed — omitting them reads as
 * "we do not have that product."
 *
 * Professional RFQ is a firm quote. Do not invent live RFQ rows.
 * Do not mount the bank transfer book onto the CEX blotter.
 *
 * Failed ≠ empty ≠ zero. Unauthorized ≠ anonymous.
 * CommonJS so goldens can require() without a bundler.
 */
'use strict';

var LIVE_IDS = ['balances', 'positions', 'open', 'fills', 'history', 'drop-copy'];
var UNAVAILABLE_IDS = ['rfq', 'borrow', 'strategies', 'transfers', 'errors'];

var LABELS = {
  balances: 'Balances',
  positions: 'Positions',
  'funding-history': 'Funding history',
  open: 'Open Orders',
  fills: 'Trade History',
  history: 'Order History',
  'drop-copy': 'Drop copy',
  rfq: 'RFQ',
  borrow: 'Borrow',
  strategies: 'Strategies',
  transfers: 'Transfers',
  errors: 'Errors'
};

var REASONS = {
  rfq: 'RFQ unavailable — no desk firm-quote query mounted',
  borrow: 'Borrow unavailable — no desk borrow query mounted',
  strategies: 'Strategies unavailable — no desk strategy query mounted',
  transfers: 'Transfers unavailable — no desk transfer query mounted',
  errors: 'Errors unavailable — no desk error-book query mounted'
};

function liveTab(id, label, count) {
  var tab = { id: id, label: label, availability: 'live' };
  if (typeof count === 'number') tab.count = count;
  return tab;
}

function unavailableTab(id) {
  return {
    id: id,
    label: LABELS[id],
    availability: 'unavailable',
    reason: REASONS[id]
  };
}

function queryMounted(queries, id) {
  if (!queries || typeof queries !== 'object') return false;
  return queries[id] === true;
}

/**
 * @param {{
 *   isPerpKind?: boolean,
 *   positionsCount?: number,
 *   openCount?: number,
 *   fundingHistoryCount?: number,
 *   dropCopyLabel?: string,
 *   queries?: { rfq?: boolean, borrow?: boolean, strategies?: boolean, transfers?: boolean, errors?: boolean }
 * }} [obs]
 * @returns {Array<{ id: string, label: string, availability: 'live'|'unavailable', reason?: string, count?: number }>}
 */
function blotterTabs(obs) {
  obs = obs || {};
  var queries = obs.queries || {};
  var list = [];

  list.push(liveTab('balances', LABELS.balances));
  list.push(liveTab('positions', LABELS.positions, obs.positionsCount));
  if (obs.isPerpKind) {
    list.push(liveTab('funding-history', LABELS['funding-history'], obs.fundingHistoryCount));
  }
  list.push(liveTab('open', LABELS.open, obs.openCount));
  list.push(liveTab('fills', LABELS.fills));
  list.push(liveTab('history', LABELS.history));
  list.push(
    liveTab('drop-copy', typeof obs.dropCopyLabel === 'string' && obs.dropCopyLabel ? obs.dropCopyLabel : LABELS['drop-copy'])
  );

  for (var i = 0; i < UNAVAILABLE_IDS.length; i++) {
    var id = UNAVAILABLE_IDS[i];
    if (queryMounted(queries, id)) {
      list.push(liveTab(id, LABELS[id]));
    } else {
      list.push(unavailableTab(id));
    }
  }
  return list;
}

/**
 * Session kind for blotter empty-states.
 * Signed-out is anonymous. A 401 on a live book is unauthorized.
 * Unavailable (query not mounted) is neither.
 *
 * @param {{ isLogin?: boolean, unauthorized?: boolean }} [session]
 * @returns {'anonymous'|'unauthorized'|'signed-in'}
 */
function sessionKind(session) {
  session = session || {};
  if (session.unauthorized === true) return 'unauthorized';
  if (session.isLogin === true) return 'signed-in';
  return 'anonymous';
}

function tabById(list, id) {
  var rows = Array.isArray(list) ? list : [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].id === id) return rows[i];
  }
  return null;
}

module.exports = {
  LIVE_IDS: LIVE_IDS,
  UNAVAILABLE_IDS: UNAVAILABLE_IDS,
  blotterTabs: blotterTabs,
  sessionKind: sessionKind,
  tabById: tabById
};
