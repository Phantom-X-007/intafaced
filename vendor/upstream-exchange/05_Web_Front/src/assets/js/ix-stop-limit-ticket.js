/**
 * Bazaar ticket stop-limit through the trade place that landed in #3289.
 * It does not live on the book until the stop prints.
 * Refuse if stopPx is missing. Ticket does not invent a trigger.
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketStopLimit(input) {
  if (input && (input.type === 'stop_limit' || input.stopPx !== undefined)) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-stop-limit');
    if (box && box.checked === true) return true;
    if (readField('ix-ticket-stop-px')) return true;
  }
  return false;
}

function readStopPx(input) {
  if (input && input.stopPx !== undefined && input.stopPx !== null) {
    var fromInput = String(input.stopPx).trim();
    if (fromInput) return fromInput;
    return null;
  }
  if (input && input.stopPrice !== undefined && input.stopPrice !== null) {
    var fromStop = String(input.stopPrice).trim();
    if (fromStop) return fromStop;
    return null;
  }
  var typed = readField('ix-ticket-stop-px');
  return typed ? typed : null;
}

function stopPxPositive(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketStopLimit(input) {
  if (!readTicketStopLimit(input)) return;
  var stopPx = readStopPx(input);
  if (!stopPxPositive(stopPx)) {
    var missing = new Error('a stop-limit requires a stopPx; trade does not invent a trigger');
    missing.code = 'trade.missing_stop_price';
    throw missing;
  }
}

function bindStopLimit(input) {
  if (!readTicketStopLimit(input)) return input;
  var stopPx = readStopPx(input);
  return Object.assign({}, input, { type: input && input.type === 'stop_limit' ? input.type : input.type, stopPx: stopPx });
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindStopLimit(input);
    assertTicketStopLimit(bound);
    var body = origCreate(bound);
    if (bound && (bound.stopPx !== undefined || (input && input.type === 'stop_limit'))) {
      body.type = 'stop_limit';
      body.stopPx = bound.stopPx == null ? null : String(bound.stopPx);
      body.stopPrice = body.stopPx;
    }
    return body;
  };
  trade.readTicketStopLimit = readTicketStopLimit;
  trade.assertTicketStopLimit = assertTicketStopLimit;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'missing_stop_price' || reason === 'trade.missing_stop_price') {
      return 'a stop-limit requires a stopPx; trade does not invent a trigger. ' + verb;
    }
    return origFail(result, action);
  };
}

function ensureStopLimitField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-stop-limit')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-stop-limit-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-stop-limit');
  boxLabel.textContent = 'Stop-limit';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-stop-limit';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Stop-limit');
  boxWrap.appendChild(box);
  var pxLabel = document.createElement('label');
  pxLabel.setAttribute('for', 'ix-ticket-stop-px');
  pxLabel.textContent = 'Stop px';
  var pxWrap = document.createElement('div');
  pxWrap.className = 'ix-input';
  var px = document.createElement('input');
  px.id = 'ix-ticket-stop-px';
  px.type = 'text';
  px.spellcheck = false;
  px.setAttribute('autocomplete', 'off');
  px.setAttribute('aria-label', 'Stop-limit stopPx');
  pxWrap.appendChild(px);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Does not live on the book until the stop prints. Trade does not invent a trigger.';
  field.appendChild(boxLabel);
  field.appendChild(boxWrap);
  field.appendChild(pxLabel);
  field.appendChild(pxWrap);
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
  if (!vm || vm.__stopLimitWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketStopLimit({
          type: this.type === 'stop_limit' ? 'stop_limit' : this.type,
          stopPx: this.stopPx,
          price: this.price
        });
      } catch (e) {
        return e && e.message ? e.message : 'stop-limit refused';
      }
      return '';
    };
  }
  var origPlace = vm.placeOrder;
  if (typeof origPlace === 'function') {
    vm.placeOrder = function () {
      try {
        return origPlace.apply(this, arguments);
      } catch (e) {
        if (e && e.code === 'trade.missing_stop_price') {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__stopLimitWrapped = true;
}

function installBazaarStopLimitTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureStopLimitField(select);
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
    if (installBazaarStopLimitTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarStopLimitTicket: installBazaarStopLimitTicket,
  readTicketStopLimit: readTicketStopLimit,
  assertTicketStopLimit: assertTicketStopLimit,
  leftoverStatus: leftoverStatus
};
