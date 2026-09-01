/**
 * Bazaar ticket price collar through the trade place that landed in #3410.
 * Caller min/max decimal strings. Missing band refuses. Ticket does not invent last or mid.
 * No Vue chrome here — Codex mounts fields later.
 */
'use strict';

var trade = require('./ix-trade.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readBox(input, key, id) {
  if (input && input[key] === true) return true;
  if (typeof document !== 'undefined') {
    var el = document.getElementById(id);
    if (el && el.checked === true) return true;
  }
  return false;
}

function readBound(input, key, id) {
  if (input && input[key] !== undefined && input[key] !== null) {
    var fromInput = String(input[key]).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField(id);
  return typed ? typed : null;
}

function wantsCollar(input) {
  if (readBox(input, 'collar', 'ix-ticket-collar')) return true;
  if (readBound(input, 'min', 'ix-ticket-collar-min')) return true;
  if (readBound(input, 'max', 'ix-ticket-collar-max')) return true;
  return false;
}

function refuse(code, message) {
  var err = new Error(message);
  err.code = code;
  throw err;
}

function assertTicketCollar(input) {
  if (!wantsCollar(input)) return;
  var min = readBound(input, 'min', 'ix-ticket-collar-min');
  var max = readBound(input, 'max', 'ix-ticket-collar-max');
  if (!min || !max) {
    refuse('trade.missing_collar', 'collar requires caller min and max; trade does not invent last or mid');
  }
}

function bindCollar(input) {
  if (!wantsCollar(input)) return input;
  var min = readBound(input, 'min', 'ix-ticket-collar-min');
  var max = readBound(input, 'max', 'ix-ticket-collar-max');
  return Object.assign({}, input, { collar: true, min: min, max: max });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindCollar(input);
    assertTicketCollar(bound);
    var body = origCreate(bound);
    if (bound && bound.collar === true) {
      body.collar = true;
      body.min = bound.min == null ? null : String(bound.min);
      body.max = bound.max == null ? null : String(bound.max);
    }
    return body;
  };
  trade.assertTicketCollar = assertTicketCollar;
  trade.bindCollar = bindCollar;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'missing_collar' || reason === 'trade.missing_collar') {
      return 'collar requires caller min and max; trade does not invent last or mid. ' + verb;
    }
    if (reason === 'outside_collar' || reason === 'trade.outside_collar') {
      return 'submit price is outside the caller collar; trade does not invent last or mid. ' + verb;
    }
    return origFail(result, action);
  };
}

module.exports = {
  wantsCollar: wantsCollar,
  assertTicketCollar: assertTicketCollar,
  bindCollar: bindCollar
};
