/**
 * remaining-SOT §12.4 — visibility / focus / reconnect revalidate snapshots.
 *
 * Elapsed client time does not prove freshness. Retry never invents success:
 * callers re-invoke existing loaders (getPlate, loadAccount, getMoney) which
 * stay refuse-closed on failure.
 *
 * Golden: node src/assets/js/desk-visibility-revalidate.golden.js
 * (from 05_Web_Front cwd)
 */
'use strict';

var EXCHANGE_SNAPSHOT_LOADERS = ['getPlate', 'loadAccount'];
var MONEY_SNAPSHOT_LOADERS = ['getMoney'];

/**
 * Always false. lastFetchAgoMs is accepted so a caller cannot "prove"
 * freshness by passing a small number.
 * @param {number} [_lastFetchAgoMs]
 * @returns {false}
 */
function elapsedProvesFreshness(_lastFetchAgoMs) {
  return false;
}

/**
 * @param {{ type?: string, visibilityState?: string, lastFetchAgoMs?: number }} event
 * @returns {boolean}
 */
function shouldRevalidate(event) {
  if (!event || typeof event !== 'object') return false;
  if (elapsedProvesFreshness(event.lastFetchAgoMs)) return false;
  var type = event.type;
  if (type === 'visibilitychange') {
    return event.visibilityState === 'visible';
  }
  if (type === 'focus' || type === 'online') {
    return true;
  }
  return false;
}

/**
 * @param {'exchange'|'money'} [surface]
 * @returns {string[]}
 */
function snapshotLoadersFor(surface) {
  if (surface === 'money') return MONEY_SNAPSHOT_LOADERS.slice();
  return EXCHANGE_SNAPSHOT_LOADERS.slice();
}

var api = {
  shouldRevalidate: shouldRevalidate,
  elapsedProvesFreshness: elapsedProvesFreshness,
  snapshotLoadersFor: snapshotLoadersFor,
  EXCHANGE_SNAPSHOT_LOADERS: EXCHANGE_SNAPSHOT_LOADERS,
  MONEY_SNAPSHOT_LOADERS: MONEY_SNAPSHOT_LOADERS
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ixDeskVisibilityRevalidate = api;
}
