/**
 * remaining-SOT §19.6 M08 + M10 — named products on the existing /exchange
 * perp ticket. Isolated-only note is not the 2×2. Do not invent a working
 * mode switch. Dated-futures expiry strip and hedge vs one-way refuse when
 * the wire does not return them. Oracle / index stays unknown unless the
 * wire sends a decimal string — never a hardcoded number.
 *
 * CommonJS so goldens can require() without a bundler.
 */
'use strict';

var MARGIN_IDS = ['isolated-standard', 'isolated-portfolio', 'cross-standard', 'cross-portfolio'];

var LABELS = {
  'isolated-standard': 'Isolated × standard',
  'isolated-portfolio': 'Isolated × portfolio margin',
  'cross-standard': 'Cross × standard',
  'cross-portfolio': 'Cross × portfolio margin',
  'dated-futures': 'Dated futures',
  'hedge-mode': 'Hedge vs one-way'
};

var REASONS = {
  'isolated-portfolio':
    'Portfolio margin unavailable — no PM door. Isolated-only is not portfolio margin, and 2×2 is four named products not a flag.',
  'cross-standard':
    'Cross margin unavailable — no cross-margin door. Isolated is a different product; a switch that still opened isolated would misreport what is backing the position.',
  'cross-portfolio':
    'Cross × portfolio margin unavailable — no 2×2 door. These are four named products, not a checkbox.',
  'dated-futures':
    'Dated futures unavailable — GET /markets sets future: false and expiry empty. No expiry strip.',
  'hedge-mode':
    'Hedge vs one-way unavailable — positions wire has no positionMode. Isolated marginMode is not a hedge switch.'
};

function doorsOf(obs) {
  return (obs && obs.doors) || {};
}

function liveProduct(id) {
  return { id: id, label: LABELS[id], availability: 'live' };
}

function refusedProduct(id) {
  return { id: id, label: LABELS[id], availability: 'unavailable', reason: REASONS[id] };
}

/**
 * Deribit 2×2 is isolated|cross × standard|PM — four named products.
 * A twoByTwo flag must not collapse this into a checkbox.
 *
 * Isolated × standard is the live ticket product (SOURCE-READ: isolated
 * positions + crossMarginRefusal). Cross / PM stay refused until doors are set.
 *
 * @param {{ doors?: { cross?: boolean, portfolio?: boolean, twoByTwo?: boolean, isolated?: boolean } }} [obs]
 */
function marginProducts(obs) {
  var doors = doorsOf(obs);
  var isolated = doors.isolated !== false;
  var cross = doors.cross === true;
  var portfolio = doors.portfolio === true;
  return [
    isolated ? liveProduct('isolated-standard') : refusedProduct('isolated-standard'),
    portfolio ? liveProduct('isolated-portfolio') : refusedProduct('isolated-portfolio'),
    cross ? liveProduct('cross-standard') : refusedProduct('cross-standard'),
    cross && portfolio ? liveProduct('cross-portfolio') : refusedProduct('cross-portfolio')
  ];
}

function hasIsoExpiry(market) {
  return !!(market && typeof market.expiryDatetime === 'string' && market.expiryDatetime.length > 0);
}

function hasExpiry(market) {
  if (hasIsoExpiry(market)) return true;
  return !!(market && market.expiry != null && market.expiry !== '');
}

/**
 * Dated futures = wire `future: true` plus an expiry. Perp listing
 * expiryDatetime (swap / future:false) is not an expiry strip.
 *
 * @param {{ markets?: Array<{ future?: boolean, expiryDatetime?: string, expiry?: unknown }> }} [obs]
 */
function datedFutures(obs) {
  var markets = (obs && Array.isArray(obs.markets) ? obs.markets : []) || [];
  var expiries = [];
  for (var i = 0; i < markets.length; i++) {
    var market = markets[i];
    if (market && market.future === true && hasExpiry(market)) {
      expiries.push(market);
    }
  }
  if (expiries.length > 0) {
    return { id: 'dated-futures', label: LABELS['dated-futures'], availability: 'live', expiries: expiries };
  }
  return {
    id: 'dated-futures',
    label: LABELS['dated-futures'],
    availability: 'unavailable',
    reason: REASONS['dated-futures'],
    expiries: []
  };
}

function readPositionMode(obs) {
  if (obs && (obs.positionMode === 'hedge' || obs.positionMode === 'one-way' || obs.positionMode === 'oneWay')) {
    return obs.positionMode === 'oneWay' ? 'one-way' : obs.positionMode;
  }
  var positions = (obs && Array.isArray(obs.positions) ? obs.positions : []) || [];
  for (var i = 0; i < positions.length; i++) {
    var row = positions[i];
    if (!row) continue;
    var mode = row.positionMode || row.hedgeMode;
    if (mode === 'hedge' || mode === 'one-way' || mode === 'oneWay') {
      return mode === 'oneWay' ? 'one-way' : mode;
    }
  }
  return null;
}

/**
 * Hedge vs one-way is a positionMode on the wire. Isolated marginMode is not it.
 *
 * @param {{ positionMode?: string, positions?: Array<{ positionMode?: string, hedgeMode?: string, marginMode?: string }> }} [obs]
 */
function hedgeMode(obs) {
  var mode = readPositionMode(obs);
  if (mode) {
    return { id: 'hedge-mode', label: LABELS['hedge-mode'], availability: 'live', mode: mode };
  }
  return {
    id: 'hedge-mode',
    label: LABELS['hedge-mode'],
    availability: 'unavailable',
    reason: REASONS['hedge-mode']
  };
}

var DECIMAL_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Oracle / index. Host funding hard-nulls indexPrice. A JS number here would
 * be a hardcoded fake. Unknown stays `—`.
 *
 * @param {unknown} value
 */
function oracleIndexPrice(value) {
  if (typeof value === 'string' && DECIMAL_STRING.test(value)) {
    return { availability: 'live', value: value };
  }
  return { availability: 'unknown', value: '—' };
}

/**
 * Ticket rows: four named margin products + dated-futures + hedge-mode.
 * Perps stays the existing tab — not duplicated here.
 *
 * @param {object} [obs]
 */
function deskRows(obs) {
  return marginProducts(obs).concat([datedFutures(obs), hedgeMode(obs)]);
}

module.exports = {
  MARGIN_IDS: MARGIN_IDS,
  marginProducts: marginProducts,
  datedFutures: datedFutures,
  hedgeMode: hedgeMode,
  oracleIndexPrice: oracleIndexPrice,
  deskRows: deskRows
};
