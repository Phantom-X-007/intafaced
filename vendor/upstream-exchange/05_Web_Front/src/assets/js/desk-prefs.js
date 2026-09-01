/**
 * Desk prefs helpers — pure (no DOM). Wave B5 panel width memory.
 * Local chrome only; never money fields.
 *
 * Golden: node src/assets/js/desk-prefs.golden.js
 */
'use strict';

/** Default desktop column widths (px) matching Exchange.vue .ix-body. */
var PANEL_DEFAULTS = {
  markets: 208,
  rail: 252,
  order: 296
};

/** Inclusive clamps — pro-desk range, not free-form. */
var PANEL_LIMITS = {
  markets: { min: 160, max: 320 },
  rail: { min: 200, max: 380 },
  order: { min: 240, max: 400 }
};

var INDICATOR_DEFAULTS = {
  rsi: true,
  macd: true
};

var PREFS_VERSION = 2;
var STORAGE_PREFIX = 'ix.desk.layout.v2';
var LEGACY_STORAGE_KEY = 'ix.desk.prefs.v1';
var GUEST_SCOPE = 'guest';

var LAYOUT_DEFAULTS = {
  pair: 'btc_usdt',
  bookMode: 'all',
  bookGroup: 1,
  interval: '60',
  mainTab: 'chart',
  railTab: 'book',
  baseFilter: 'USDT',
  accountTab: 'balances',
  side: 'BUY'
};

function normalizeIndicatorVisibility(input) {
  var src = input && typeof input === 'object' ? input : {};
  return {
    rsi: typeof src.rsi === 'boolean' ? src.rsi : INDICATOR_DEFAULTS.rsi,
    macd: typeof src.macd === 'boolean' ? src.macd : INDICATOR_DEFAULTS.macd
  };
}

/**
 * @param {'markets'|'rail'|'order'} key
 * @param {*} value
 * @returns {number}
 */
function clampPanelWidth(key, value) {
  var lim = PANEL_LIMITS[key];
  var def = PANEL_DEFAULTS[key];
  if (!lim) return typeof def === 'number' ? def : 0;
  var n = Number(value);
  if (!isFinite(n)) n = def;
  n = Math.round(n);
  if (n < lim.min) return lim.min;
  if (n > lim.max) return lim.max;
  return n;
}

/**
 * Normalize a prefs.panels object into safe widths.
 * @param {*} input
 * @returns {{ markets: number, rail: number, order: number }}
 */
function normalizePanelWidths(input) {
  var src = input && typeof input === 'object' ? input : {};
  return {
    markets: clampPanelWidth('markets', src.markets != null ? src.markets : PANEL_DEFAULTS.markets),
    rail: clampPanelWidth('rail', src.rail != null ? src.rail : PANEL_DEFAULTS.rail),
    order: clampPanelWidth('order', src.order != null ? src.order : PANEL_DEFAULTS.order)
  };
}

/**
 * Apply drag delta to a panel width (splitter: drag right grows that column).
 * @param {'markets'|'rail'|'order'} key
 * @param {number} startWidth
 * @param {number} deltaX clientX delta from mousedown
 * @returns {number}
 */
function panelWidthAfterDrag(key, startWidth, deltaX) {
  return clampPanelWidth(key, Number(startWidth) + Number(deltaX || 0));
}

function principalScope(principal) {
  var value = principal == null ? '' : String(principal).trim();
  return value ? 'p-' + encodeURIComponent(value) : GUEST_SCOPE;
}

function storageKey(principal) {
  return STORAGE_PREFIX + ':' + principalScope(principal);
}

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) >= 0 ? value : fallback;
}

/** Whitelist local display state. Unknown fields never survive a migration. */
function normalizeLayout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  var pair = typeof input.pair === 'string' && /^[a-z0-9]+_[a-z0-9]+$/i.test(input.pair)
    ? input.pair.toLowerCase()
    : LAYOUT_DEFAULTS.pair;
  var baseFilter = typeof input.baseFilter === 'string' &&
    /^(favor|[a-z0-9]{1,16})$/i.test(input.baseFilter)
    ? input.baseFilter
    : LAYOUT_DEFAULTS.baseFilter;
  var panelWidths = normalizePanelWidths(input.panels);
  return {
    pair: pair,
    bookMode: oneOf(input.bookMode, ['all', 'bids', 'asks'], LAYOUT_DEFAULTS.bookMode),
    bookGroup: oneOf(Number(input.bookGroup), [1, 10, 50, 100], LAYOUT_DEFAULTS.bookGroup),
    interval: oneOf(input.interval, ['1', '5', '15', '30', '60', '1D', '1W'], LAYOUT_DEFAULTS.interval),
    mainTab: oneOf(input.mainTab, ['chart', 'depth', 'book', 'trades'], LAYOUT_DEFAULTS.mainTab),
    railTab: oneOf(input.railTab, ['book', 'trades'], LAYOUT_DEFAULTS.railTab),
    baseFilter: baseFilter,
    accountTab: oneOf(
      input.accountTab,
      ['balances', 'positions', 'open', 'fills', 'history', 'drop-copy'],
      LAYOUT_DEFAULTS.accountTab
    ),
    side: oneOf(input.side, ['BUY', 'SELL'], LAYOUT_DEFAULTS.side),
    /* Book and ticket are stacked in one live right column. Do not persist the
       obsolete independent rail width from the former four-column layout. */
    panels: { markets: panelWidths.markets, order: panelWidths.order },
    indicators: normalizeIndicatorVisibility(input.indicators)
  };
}

function decodeEnvelope(raw, principal) {
  if (typeof raw !== 'string' || !raw) return { ok: false, reason: 'missing' };
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'corrupt' };
  }
  if (!parsed || parsed.version !== PREFS_VERSION) return { ok: false, reason: 'version' };
  if (parsed.principal !== principalScope(principal)) return { ok: false, reason: 'principal' };
  var layout = normalizeLayout(parsed.layout);
  return layout ? { ok: true, layout: layout } : { ok: false, reason: 'corrupt' };
}

function read(storage, principal) {
  var key = storageKey(principal);
  var raw;
  try {
    raw = storage.getItem(key);
  } catch (e) {
    return { ok: false, reason: 'storage_unavailable', key: key };
  }
  var result = decodeEnvelope(raw, principal);
  result.key = key;
  if (!result.ok && result.reason !== 'missing') {
    try { storage.removeItem(key); } catch (e) { /* refuse the value even if cleanup fails */ }
  }
  return result;
}

function write(storage, principal, input) {
  var key = storageKey(principal);
  var layout = normalizeLayout(input);
  if (!layout) return { ok: false, reason: 'corrupt', key: key };
  try {
    storage.setItem(key, JSON.stringify({
      version: PREFS_VERSION,
      principal: principalScope(principal),
      layout: layout
    }));
    return { ok: true, key: key, layout: layout };
  } catch (e) {
    return {
      ok: false,
      reason: e && (e.name === 'QuotaExceededError' || e.code === 22) ? 'quota' : 'storage_unavailable',
      key: key
    };
  }
}

function remove(storage, principal) {
  var key = storageKey(principal);
  try {
    storage.removeItem(key);
    return { ok: true, key: key };
  } catch (e) {
    return { ok: false, reason: 'storage_unavailable', key: key };
  }
}

/**
 * The v1 key had no owner. It is safe to migrate only into the anonymous
 * scope; assigning it to a signed-in principal could expose another user's
 * local desk choices on a shared browser.
 */
function migrateLegacyGuest(storage, principal) {
  if (principalScope(principal) !== GUEST_SCOPE) return { ok: false, reason: 'legacy_unscoped' };
  var raw;
  try {
    raw = storage.getItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    return { ok: false, reason: 'storage_unavailable' };
  }
  if (!raw) return { ok: false, reason: 'missing' };
  var legacy;
  try {
    legacy = JSON.parse(raw);
  } catch (e) {
    try { storage.removeItem(LEGACY_STORAGE_KEY); } catch (ignore) {}
    return { ok: false, reason: 'corrupt' };
  }
  var saved = write(storage, principal, legacy);
  if (!saved.ok) return saved;
  try { storage.removeItem(LEGACY_STORAGE_KEY); } catch (ignore) {}
  saved.migrated = true;
  return saved;
}

/**
 * CSS grid-template-columns for four-column desk with 6px splitters.
 * @param {{ markets: number, rail: number, order: number }} widths
 * @returns {string}
 */
function deskGridTemplate(widths) {
  var w = normalizePanelWidths(widths);
  return (
    w.markets +
    'px 6px minmax(0, 1fr) 6px ' +
    w.rail +
    'px 6px ' +
    w.order +
    'px'
  );
}

var api = {
  PREFS_VERSION: PREFS_VERSION,
  STORAGE_PREFIX: STORAGE_PREFIX,
  LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
  GUEST_SCOPE: GUEST_SCOPE,
  LAYOUT_DEFAULTS: LAYOUT_DEFAULTS,
  PANEL_DEFAULTS: PANEL_DEFAULTS,
  PANEL_LIMITS: PANEL_LIMITS,
  INDICATOR_DEFAULTS: INDICATOR_DEFAULTS,
  normalizeIndicatorVisibility: normalizeIndicatorVisibility,
  clampPanelWidth: clampPanelWidth,
  normalizePanelWidths: normalizePanelWidths,
  panelWidthAfterDrag: panelWidthAfterDrag,
  deskGridTemplate: deskGridTemplate,
  principalScope: principalScope,
  storageKey: storageKey,
  normalizeLayout: normalizeLayout,
  decodeEnvelope: decodeEnvelope,
  read: read,
  write: write,
  remove: remove,
  migrateLegacyGuest: migrateLegacyGuest
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ixDeskPrefs = api;
}
