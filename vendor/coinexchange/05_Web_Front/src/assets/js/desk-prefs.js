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
  PANEL_DEFAULTS: PANEL_DEFAULTS,
  PANEL_LIMITS: PANEL_LIMITS,
  clampPanelWidth: clampPanelWidth,
  normalizePanelWidths: normalizePanelWidths,
  panelWidthAfterDrag: panelWidthAfterDrag,
  deskGridTemplate: deskGridTemplate
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ixDeskPrefs = api;
}
