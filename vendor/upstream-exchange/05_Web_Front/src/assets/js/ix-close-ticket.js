/**
 * Bazaar ticket flatten through the trade close that landed in #3257.
 *
 * POST /api/v1/spot/positions/close. Matching owns net fills.
 * Trade does not invent a mark, qty, or side. Flat refuses trade.position_flat.
 */
'use strict';

var trade = require('./ix-trade.js');

var CLOSE_PATH = '/api/v1/spot/positions/close';

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function wantsClose(input) {
  if (input && input.closePosition === true) return true;
  if (typeof document !== 'undefined') {
    var el = document.getElementById('ix-ticket-close');
    if (el && el.checked === true) return true;
  }
  return false;
}

function toClosePositionBody(input) {
  var src = input || {};
  if (src.price !== undefined || src.qty !== undefined || src.amount !== undefined || src.mark !== undefined) {
    var markErr = new Error('close does not take a mark, qty, or price; matching owns the net');
    markErr.code = 'trade.invalid_qty';
    throw markErr;
  }
  var clientOrderId = typeof src.clientOrderId === 'string' ? src.clientOrderId.trim() : '';
  if (!clientOrderId) clientOrderId = readField('ix-ticket-close-client');
  var symbol = typeof src.symbol === 'string' ? src.symbol.trim() : '';
  if (!symbol) symbol = readField('ix-ticket-symbol');
  var marketId = typeof src.marketId === 'string' ? src.marketId.trim() : '';
  if (!clientOrderId || (!symbol && !marketId)) {
    var err = new Error('close requires clientOrderId and marketId|symbol; trade does not invent a mark');
    err.code = 'trade.bad_request';
    throw err;
  }
  var body = { clientOrderId: clientOrderId };
  if (marketId) body.marketId = marketId;
  if (symbol) body.symbol = symbol;
  return body;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'close' ? 'The position was not closed.' : action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'position_flat' || reason === 'trade.position_flat') {
      return 'Account is flat on this book; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
  trade.toClosePositionBody = toClosePositionBody;
  trade.CLOSE_PATH = CLOSE_PATH;
}

function ensureCloseField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-close-wrap')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-close-wrap';
  var label = document.createElement('label');
  label.setAttribute('for', 'ix-ticket-close');
  label.textContent = 'Close position';
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = 'ix-ticket-close';
  input.type = 'checkbox';
  input.setAttribute('aria-label', 'Close position through matching flatten');
  inputWrap.appendChild(input);
  var client = document.createElement('input');
  client.id = 'ix-ticket-close-client';
  client.type = 'text';
  client.spellcheck = false;
  client.setAttribute('autocomplete', 'off');
  client.setAttribute('aria-label', 'Close clientOrderId');
  client.placeholder = 'clientOrderId';
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Flatten through trade close. Matching owns the net. No invented mark.';
  field.appendChild(label);
  field.appendChild(inputWrap);
  field.appendChild(client);
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueClose(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__closeWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      if (!wantsClose({ closePosition: this.closePosition === true })) return '';
      try {
        toClosePositionBody({
          closePosition: true,
          symbol: this.symbol,
          marketId: this.marketId,
          clientOrderId: this.clientOrderId
        });
      } catch (e) {
        return e && e.message ? e.message : 'close refused';
      }
      return '';
    };
  }
  var origPlace = vm.placeOrder;
  if (typeof origPlace === 'function') {
    vm.placeOrder = function () {
      if (!wantsClose({ closePosition: this.closePosition === true })) {
        return origPlace.apply(this, arguments);
      }
      try {
        var body = toClosePositionBody({
          closePosition: true,
          symbol: this.symbol,
          marketId: this.marketId,
          clientOrderId: this.clientOrderId
        });
        this.__closeBody = body;
        this.__closePath = CLOSE_PATH;
        if (typeof this.rest === 'function') {
          return this.rest('POST', CLOSE_PATH, body);
        }
        if (typeof this.query === 'function') {
          return this.query('POST', CLOSE_PATH, body);
        }
        this.submitting = false;
        return { path: CLOSE_PATH, body: body };
      } catch (e) {
        if (e && (e.code === 'trade.invalid_qty' || e.code === 'trade.bad_request' || e.code === 'trade.position_flat')) {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__closeWrapped = true;
}

function installBazaarCloseTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureCloseField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueClose(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarCloseTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarCloseTicket: installBazaarCloseTicket,
  toClosePositionBody: toClosePositionBody,
  wantsClose: wantsClose,
  CLOSE_PATH: CLOSE_PATH
};
