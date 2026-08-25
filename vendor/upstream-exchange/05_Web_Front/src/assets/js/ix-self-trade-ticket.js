/**
 * Bazaar ticket self-trade refuse through matching #3336 / trade #3342.
 * Same-account cross shows trade.self_trade. Incoming does not rest.
 * Ticket does not invent a fill or a second book. A place that is not that
 * refuse proceeds. Session mass-cancel refuse stays named, not invented.
 */
'use strict';

var trade = require('./ix-trade.js');
var outcome = require('./ix-order-outcome.js');

var SELF_TRADE_COPY =
  'trade.self_trade — incoming would match the same account; trade does not invent a self-fill. Incoming does not rest';
var SESSION_MASS_CANCEL_COPY =
  'session mass-cancel is unsupported; trade does not invent a session';

function selfTradeCode(value) {
  var s = String(value || '');
  return s === 'self_trade' || s === 'trade.self_trade';
}

function refuseCode(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.intafacedCode) return String(result.intafacedCode);
  if (result.reason) return String(result.reason);
  if (result.code) return String(result.code);
  if (result.rejectCode) return String(result.rejectCode);
  if (result.reject_code) return String(result.reject_code);
  return '';
}

function isSelfTradeRefuse(result) {
  if (!result || typeof result !== 'object') return false;
  if (selfTradeCode(refuseCode(result))) return true;
  var data = result.data;
  if (data && typeof data === 'object') {
    if (selfTradeCode(refuseCode(data))) return true;
    if (selfTradeCode(data.rejectCode) || selfTradeCode(data.reject_code)) return true;
  }
  var said = result.message && String(result.message);
  if (said && said.indexOf('would match the same account') !== -1) return true;
  return false;
}

function isSessionMassCancelRefuse(result) {
  var code = refuseCode(result);
  return code === 'session_unsupported' || code === 'trade.session_unsupported';
}

function refuseCopy(action) {
  var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
  return SELF_TRADE_COPY + '. ' + verb;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (isSelfTradeRefuse(result)) return refuseCopy(action);
    if (isSessionMassCancelRefuse(result)) return SESSION_MASS_CANCEL_COPY + '. ' + verb;
    return origFail(result, action);
  };
  trade.isSelfTradeRefuse = isSelfTradeRefuse;
}

if (outcome && typeof outcome.classify === 'function') {
  var origClassify = outcome.classify;
  outcome.classify = function (result, action) {
    if (action === 'submit' && result && result.reason === 'unreachable') {
      return origClassify(result, action);
    }
    if (action === 'submit' && isSelfTradeRefuse(result)) {
      return {
        kind: 'refused',
        outcome: 'REFUSED',
        state: 'REFUSED',
        reasonCode: 'trade.self_trade',
        reconciliationKey: null,
        message: refuseCopy('place')
      };
    }
    return origClassify(result, action);
  };
}

function ensureSelfTradeNote(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-self-trade-note')) return;
  if (!select || !select.parentNode) return;
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.id = 'ix-ticket-self-trade-note';
  note.textContent =
    'Same-account crossing refuses as trade.self_trade. Incoming does not rest. No invented fill.';
  select.parentNode.appendChild(note);
}

function wrapVuePlace(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__selfTradeWrapped) return;
  var origPlace = vm.placeOrder;
  if (typeof origPlace === 'function') {
    vm.placeOrder = function () {
      try {
        return origPlace.apply(this, arguments);
      } catch (e) {
        if (e && isSelfTradeRefuse(e)) {
          this.submitting = false;
          var msg = refuseCopy('place');
          if (typeof this.focusOrderError === 'function') this.focusOrderError(msg);
          else if (typeof this.warn === 'function') this.warn(msg);
          return;
        }
        throw e;
      }
    };
  }
  vm.__selfTradeWrapped = true;
}

function installBazaarSelfTradeTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureSelfTradeNote(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVuePlace(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarSelfTradeTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarSelfTradeTicket: installBazaarSelfTradeTicket,
  isSelfTradeRefuse: isSelfTradeRefuse,
  isSessionMassCancelRefuse: isSessionMassCancelRefuse,
  SELF_TRADE_COPY: SELF_TRADE_COPY,
  SESSION_MASS_CANCEL_COPY: SESSION_MASS_CANCEL_COPY
};
