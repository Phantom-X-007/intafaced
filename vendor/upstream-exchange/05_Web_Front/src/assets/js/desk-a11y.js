/**
 * Desk a11y helpers — pure (no DOM) for the vendor Exchange shell (:8090).
 *
 * Board Clear A-UI-A11Y / Wave B10 baseline:
 * - GOV.UK error-summary: focus moves to summary; summary text matches field error.
 * - LiveAnnouncer-style: re-announce identical text via clear-then-set.
 *
 * Golden: node src/assets/js/desk-a11y.golden.js  (from 05_Web_Front cwd)
 */
'use strict';

/** Stable ids for ticket controls (match Exchange.vue markup). */
var TICKET_FIELD_IDS = {
  price: 'ix-ticket-price',
  amount: 'ix-ticket-amount',
  summary: 'ix-ticket-error-summary'
};

/**
 * Map a ticket validation / block message to a field focus target.
 * Uses known copy from Exchange.validateOrderFields + orderBlockReason only —
 * never invents a field when the message is general (balance, halt, feed).
 *
 * @param {string} [message]
 * @returns {'price'|'amount'|'general'}
 */
function ticketErrorField(message) {
  var m = String(message || '');
  if (!m) return 'general';
  /* Price-specific first (limit price), before generic "Enter". */
  if (/limit price|valid limit price|price is too large/i.test(m)) {
    return 'price';
  }
  if (/^enter a limit price/i.test(m)) {
    return 'price';
  }
  if (/amount|scientific notation/i.test(m)) {
    return 'amount';
  }
  return 'general';
}

/**
 * GOV.UK-style error summary model for the order ticket.
 * Summary message must match the inline error verbatim (catalog rule).
 *
 * @param {string} [message]
 * @returns {null | {
 *   id: string,
 *   title: string,
 *   message: string,
 *   field: 'price'|'amount'|'general',
 *   fieldId: string|null,
 *   href: string|null
 * }}
 */
function buildTicketErrorSummary(message) {
  var msg = String(message || '').trim();
  if (!msg) return null;
  var field = ticketErrorField(msg);
  var fieldId =
    field === 'price' ? TICKET_FIELD_IDS.price : field === 'amount' ? TICKET_FIELD_IDS.amount : null;
  return {
    id: TICKET_FIELD_IDS.summary,
    title: 'There is a problem',
    message: msg,
    field: field,
    fieldId: fieldId,
    href: fieldId ? '#' + fieldId : null
  };
}

/**
 * ARIA attrs for a ticket field given the active validation message.
 *
 * @param {'price'|'amount'} field
 * @param {string} [message]
 * @returns {{ 'aria-invalid': 'true'|'false', 'aria-describedby': string|undefined }}
 */
function ticketFieldAria(field, message) {
  var summary = buildTicketErrorSummary(message);
  var invalid = !!(summary && summary.field === field);
  return {
    'aria-invalid': invalid ? 'true' : 'false',
    'aria-describedby': invalid ? TICKET_FIELD_IDS.summary : undefined
  };
}

/**
 * LiveAnnouncer-style update plan (react-spectrum append-node idea, pure).
 * When the next string equals the previous, AT will not re-speak unless the
 * region is cleared first — callers apply clear, then set on next frame.
 *
 * @param {string} [previous]
 * @param {string} [next]
 * @returns {{ text: string, needsClearFirst: boolean }}
 */
function liveAnnounceUpdate(previous, next) {
  var p = previous == null ? '' : String(previous);
  var n = next == null ? '' : String(next);
  if (!n) {
    return { text: '', needsClearFirst: false };
  }
  if (n === p) {
    return { text: n, needsClearFirst: true };
  }
  return { text: n, needsClearFirst: false };
}

/**
 * B4 — pure Tab wrap for modal/dialog focus trap (no DOM).
 * Returns the next focusable index, wrapping at ends. Empty list → -1.
 *
 * @param {number} activeIndex index of currently focused item in list
 * @param {number} length focusable count
 * @param {boolean} [shiftKey] true = reverse (Shift+Tab)
 * @returns {number}
 */
function tabWrapIndex(activeIndex, length, shiftKey) {
  var n = length | 0;
  if (n < 1) return -1;
  var i = activeIndex | 0;
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  if (shiftKey) {
    return i <= 0 ? n - 1 : i - 1;
  }
  return i >= n - 1 ? 0 : i + 1;
}

/**
 * Whether a dialog should intercept Tab for focus trap.
 *
 * @param {boolean} open
 * @param {number} focusableCount
 * @returns {boolean}
 */
function shouldTrapTab(open, focusableCount) {
  return !!open && (focusableCount | 0) > 0;
}

/**
 * Documented baseline checklist (PR evidence / residual B10). Not runtime.
 */
var DESK_A11Y_BASELINE = [
  {
    id: 'skip-link',
    note: 'Skip to order ticket (#ix-ticket)'
  },
  {
    id: 'focus-visible',
    note: 'Visible :focus-visible ring on ticket, book, tabs, submit'
  },
  {
    id: 'error-summary',
    note: 'GOV.UK: focus error summary; text matches field error'
  },
  {
    id: 'live-announce',
    note: 'aria-live + clear-then-set for identical re-announce'
  },
  {
    id: 'keyboard-floor',
    note: 'A-UI-1 map: / Esc B S T Enter X (desk-hotkeys.js)'
  },
  {
    id: 'field-labels',
    note: 'Price/amount labelled; aria-invalid when field-scoped error'
  },
  {
    id: 'focus-trap',
    note: 'B4: Tab cycles inside open dialog (⌘K); restore focus on close'
  }
];

var api = {
  TICKET_FIELD_IDS: TICKET_FIELD_IDS,
  ticketErrorField: ticketErrorField,
  buildTicketErrorSummary: buildTicketErrorSummary,
  ticketFieldAria: ticketFieldAria,
  liveAnnounceUpdate: liveAnnounceUpdate,
  tabWrapIndex: tabWrapIndex,
  shouldTrapTab: shouldTrapTab,
  DESK_A11Y_BASELINE: DESK_A11Y_BASELINE
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ixDeskA11y = api;
}
