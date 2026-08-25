/**
 * Bazaar ticket STP refuse copy through the trade place that landed in #3342.
 * Matching expire-taker self_trade is a place refuse. No silent fill.
 * Resting maker stays. Ticket does not invent a self-fill or cancel the rest.
 */
'use strict';

var trade = require('./ix-trade.js');

var SELF_TRADE_COPY =
  'incoming order would match the same account; trade does not invent a self-fill';
var SESSION_MASS_CANCEL_COPY =
  'session mass-cancel is unsupported; trade does not invent a session';

function refuseCode(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.intafacedCode) return String(result.intafacedCode);
  if (result.reason) return String(result.reason);
  return '';
}

function isSelfTradeRefuse(result) {
  var code = refuseCode(result);
  return code === 'self_trade' || code === 'trade.self_trade';
}

function isSessionMassCancelRefuse(result) {
  var code = refuseCode(result);
  return code === 'session_unsupported' || code === 'trade.session_unsupported';
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (isSelfTradeRefuse(result)) {
      return SELF_TRADE_COPY + '. ' + verb;
    }
    if (isSessionMassCancelRefuse(result)) {
      return SESSION_MASS_CANCEL_COPY + '. ' + verb;
    }
    return origFail(result, action);
  };
}

module.exports = {
  isSelfTradeRefuse: isSelfTradeRefuse,
  isSessionMassCancelRefuse: isSessionMassCancelRefuse,
  SELF_TRADE_COPY: SELF_TRADE_COPY,
  SESSION_MASS_CANCEL_COPY: SESSION_MASS_CANCEL_COPY
};
