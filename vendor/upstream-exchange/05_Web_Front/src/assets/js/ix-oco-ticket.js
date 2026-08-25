/**
 * Bazaar ticket linked TP+SL (OCO) through the trade place that landed in #3243.
 *
 * Forwards takeProfit + stopLoss as one user move. Both stopPrices are the
 * caller's. Blank trigger refuses trade.missing_oco_trigger. No invented trigger.
 */
'use strict';

var trade = require('./ix-trade.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function asLeg(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var stop = typeof raw.stopPrice === 'string' ? raw.stopPrice.trim() : '';
  if (!stop) return null;
  var leg = { stopPrice: stop };
  if (typeof raw.price === 'string' && raw.price.trim()) leg.price = raw.price.trim();
  return leg;
}

function readTicketLeg(input, name, fieldId) {
  var fromInput = asLeg(input && input[name]);
  if (fromInput) return fromInput;
  var typed = readField(fieldId);
  return typed ? { stopPrice: typed } : null;
}

function wantsOco(input) {
  if (input && (input.takeProfit != null || input.stopLoss != null)) return true;
  if (readField('ix-ticket-tp-stop') || readField('ix-ticket-sl-stop')) return true;
  return false;
}

function assertTicketOco(input) {
  if (!wantsOco(input)) return;
  var takeProfit = readTicketLeg(input, 'takeProfit', 'ix-ticket-tp-stop');
  var stopLoss = readTicketLeg(input, 'stopLoss', 'ix-ticket-sl-stop');
  if (takeProfit && stopLoss) return;
  var err = new Error('OCO requires both stopPrices; trade does not invent a trigger');
  err.code = 'trade.missing_oco_trigger';
  throw err;
}

function bindOco(input) {
  if (!wantsOco(input)) return input;
  var takeProfit = readTicketLeg(input, 'takeProfit', 'ix-ticket-tp-stop');
  var stopLoss = readTicketLeg(input, 'stopLoss', 'ix-ticket-sl-stop');
  if (!takeProfit && !stopLoss) return input;
  return Object.assign({}, input, { takeProfit: takeProfit, stopLoss: stopLoss });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindOco(input);
    assertTicketOco(bound);
    var body = origCreate(bound);
    if (bound && bound.takeProfit && bound.stopLoss) {
      body.takeProfit = { stopPrice: bound.takeProfit.stopPrice };
      if (bound.takeProfit.price) body.takeProfit.price = bound.takeProfit.price;
      body.stopLoss = { stopPrice: bound.stopLoss.stopPrice };
      if (bound.stopLoss.price) body.stopLoss.price = bound.stopLoss.price;
    }
    return body;
  };
  trade.readTicketOco = function (input) {
    return {
      takeProfit: readTicketLeg(input, 'takeProfit', 'ix-ticket-tp-stop'),
      stopLoss: readTicketLeg(input, 'stopLoss', 'ix-ticket-sl-stop')
    };
  };
  trade.assertTicketOco = assertTicketOco;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'missing_oco_trigger' || reason === 'trade.missing_oco_trigger') {
      return 'OCO requires both stopPrices; trade does not invent a trigger. ' + verb;
    }
    return origFail(result, action);
  };
}

function ensureOcoFields(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-tp-stop')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-oco-wrap';
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Linked TP+SL. Both stopPrices required. Trade does not invent a trigger.';
  function addStop(id, labelText, aria) {
    var label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    var inputWrap = document.createElement('div');
    inputWrap.className = 'ix-input';
    var input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', aria);
    inputWrap.appendChild(input);
    field.appendChild(label);
    field.appendChild(inputWrap);
  }
  addStop('ix-ticket-tp-stop', 'Take profit stop', 'OCO takeProfit stopPrice');
  addStop('ix-ticket-sl-stop', 'Stop loss stop', 'OCO stopLoss stopPrice');
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVuePlace(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__ocoWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      var tp = readField('ix-ticket-tp-stop');
      var sl = readField('ix-ticket-sl-stop');
      if (!tp && !sl) return '';
      if (!tp || !sl) return 'OCO requires both stopPrices; trade does not invent a trigger';
      return '';
    };
  }
  var origPlace = vm.placeOrder;
  if (typeof origPlace === 'function') {
    vm.placeOrder = function () {
      try {
        return origPlace.apply(this, arguments);
      } catch (e) {
        if (e && e.code === 'trade.missing_oco_trigger') {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__ocoWrapped = true;
}

function installBazaarOcoTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOcoFields(select);
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
    if (installBazaarOcoTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOcoTicket: installBazaarOcoTicket,
  readTicketLeg: readTicketLeg,
  assertTicketOco: assertTicketOco
};
require('./ix-close-ticket.js');
require('./ix-post-only-ticket.js');
