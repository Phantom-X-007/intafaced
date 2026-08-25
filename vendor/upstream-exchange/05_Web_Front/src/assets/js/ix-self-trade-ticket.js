/**
 * Bazaar ticket self-trade through matching #3357.
 * Same-account rest is cancelled (self_trade_prevention). Incoming continues
 * (fills or rests). Ticket does not invent a fill, a second book, or an STP
 * mode. Missing or different account is a normal place. Trade.self_trade is
 * still a place refuse if trade maps it. Session mass-cancel refuse stays named.
 */
'use strict';

var trade = require('./ix-trade.js');
var outcome = require('./ix-order-outcome.js');

var SELF_TRADE_COPY =
  'trade.self_trade — incoming would match the same account; trade does not invent a self-fill';
var SELF_TRADE_PREVENTION_COPY =
  'self_trade_prevention — resting order cancelled (self-trade prevention). Incoming continues (fills or rests). Trade does not invent a self-fill';
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

function cancellationReason(row) {
  if (!row || typeof row !== 'object') return '';
  return String(row.reason || row.code || '');
}

function listCancellations(result) {
  if (!result || typeof result !== 'object') return [];
  if (Array.isArray(result.cancellations)) return result.cancellations;
  var data = result.data;
  if (data && typeof data === 'object' && Array.isArray(data.cancellations)) return data.cancellations;
  return [];
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

function isSelfTradePrevention(result) {
  if (!result || typeof result !== 'object') return false;
  if (refuseCode(result) === 'self_trade_prevention') return true;
  var data = result.data;
  if (data && typeof data === 'object' && refuseCode(data) === 'self_trade_prevention') return true;
  var list = listCancellations(result);
  for (var i = 0; i < list.length; i++) {
    if (cancellationReason(list[i]) === 'self_trade_prevention') return true;
  }
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
    if (isSelfTradePrevention(result)) return SELF_TRADE_PREVENTION_COPY;
    if (isSelfTradeRefuse(result)) return refuseCopy(action);
    if (isSessionMassCancelRefuse(result)) return SESSION_MASS_CANCEL_COPY + '. ' + verb;
    return origFail(result, action);
  };
  trade.isSelfTradeRefuse = isSelfTradeRefuse;
  trade.isSelfTradePrevention = isSelfTradePrevention;
}

if (outcome && typeof outcome.classify === 'function') {
  var origClassify = outcome.classify;
  outcome.classify = function (result, action) {
    if (action === 'submit' && result && result.reason === 'unreachable') {
      return origClassify(result, action);
    }
    if (action === 'submit' && isSelfTradePrevention(result)) {
      var inner = origClassify(result, action);
      if (inner.kind !== 'applied') {
        inner = {
          kind: 'applied',
          outcome: 'APPLIED',
          state: 'APPLIED',
          reasonCode: null,
          reconciliationKey: null,
          data: (result && result.data) || result || null
        };
      }
      inner.message = SELF_TRADE_PREVENTION_COPY;
      return inner;
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
    'Same-account rest is cancelled (self-trade prevention). Incoming continues (fills or rests). No invented fill.';
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
  isSelfTradePrevention: isSelfTradePrevention,
  isSessionMassCancelRefuse: isSessionMassCancelRefuse,
  SELF_TRADE_COPY: SELF_TRADE_COPY,
  SELF_TRADE_PREVENTION_COPY: SELF_TRADE_PREVENTION_COPY,
  SESSION_MASS_CANCEL_COPY: SESSION_MASS_CANCEL_COPY
};
