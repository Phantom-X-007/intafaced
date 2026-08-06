/**
 * Desk trade hotkeys — pure resolver for the vendor Exchange shell (:8090).
 *
 * Board Clear A-UI-1 / Wave B7+ keyboard floor. No DOM, no balances, no orderbook.
 * Wired by Exchange.vue → existing methods only (submitOrder, cancelOrder, setSide).
 *
 * Golden: node src/assets/js/desk-hotkeys.golden.js  (from 05_Web_Front cwd)
 */
'use strict';

/**
 * @param {string} [tag] element tagName
 * @param {boolean} [isContentEditable]
 * @returns {boolean}
 */
function isTypingTarget(tag, isContentEditable) {
  var t = (tag || '').toUpperCase();
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || !!isContentEditable;
}

/**
 * Human-readable map (docs / PR evidence / a11y). Not used for dispatch.
 * Keys are what the trader sees; actions are resolveDeskHotkey() ids.
 */
var DESK_HOTKEY_MAP = [
  {
    keys: ['/'],
    action: 'focus_market_search',
    when: 'not typing',
    note: 'Focus market search'
  },
  {
    keys: ['Esc'],
    action: 'escape',
    when: 'always',
    note: 'Clear market search and blur focused field'
  },
  {
    keys: ['B'],
    action: 'focus_buy_ticket',
    when: 'not typing',
    note: 'Select Buy and focus order ticket'
  },
  {
    keys: ['S'],
    action: 'focus_sell_ticket',
    when: 'not typing',
    note: 'Select Sell and focus order ticket'
  },
  {
    keys: ['T'],
    action: 'focus_ticket',
    when: 'not typing',
    note: 'Focus order ticket (keep current side)'
  },
  {
    keys: ['Enter'],
    action: 'submit',
    when: 'ticket price/amount fields',
    note: 'Submit order (existing confirm dialog; not from window capture)'
  },
  {
    keys: ['X'],
    action: 'cancel_last_open',
    when: 'not typing',
    note: 'Cancel most recent open order (existing confirm dialog)'
  }
];

/**
 * Resolve a keyboard event into a desk action id.
 *
 * @param {{ key: string, altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, defaultPrevented?: boolean }} e
 * @param {{ typing?: boolean, fromWindow?: boolean }} [ctx]
 * @returns {null | { action: string, preventDefault: boolean }}
 */
function resolveDeskHotkey(e, ctx) {
  if (!e || e.defaultPrevented) return null;
  if (e.altKey || e.ctrlKey || e.metaKey) return null;

  var typing = !!(ctx && ctx.typing);
  var fromWindow = !!(ctx && ctx.fromWindow);
  var key = e.key;

  if (key === 'Escape') {
    return { action: 'escape', preventDefault: true };
  }

  /* Window capture must not steal Enter from native form controls or double-fire. */
  if (fromWindow && (key === 'Enter' || key === 'NumpadEnter')) {
    return null;
  }

  if (!typing && key === '/') {
    return { action: 'focus_market_search', preventDefault: true };
  }
  if (!typing && (key === 'b' || key === 'B')) {
    return { action: 'focus_buy_ticket', preventDefault: true };
  }
  if (!typing && (key === 's' || key === 'S')) {
    return { action: 'focus_sell_ticket', preventDefault: true };
  }
  if (!typing && (key === 't' || key === 'T')) {
    return { action: 'focus_ticket', preventDefault: true };
  }
  if (!typing && (key === 'x' || key === 'X')) {
    return { action: 'cancel_last_open', preventDefault: true };
  }

  /* Enter while typing is handled by field @keydown.enter → submitOrder.
     Resolver documents the action for tests; Vue field handler remains source of truth. */
  if (typing && !fromWindow && (key === 'Enter' || key === 'NumpadEnter')) {
    return { action: 'submit', preventDefault: true };
  }

  return null;
}

var api = {
  resolveDeskHotkey: resolveDeskHotkey,
  isTypingTarget: isTypingTarget,
  DESK_HOTKEY_MAP: DESK_HOTKEY_MAP
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ixDeskHotkeys = api;
}
