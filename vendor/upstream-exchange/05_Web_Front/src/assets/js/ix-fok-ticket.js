/**
 * Bazaar ticket FOK through the trade place that landed in #3277.
 * Fill completely or cancel the whole. No leftover rest. Ticket does not invent a fill.
 */
'use strict';

var trade = require('./ix-trade.js');

function readTicketFok(input) {
  if (input && (input.timeInForce === 'FOK' || input.tif === 'FOK')) return true;
  if (typeof document !== 'undefined') {
    var tif = document.getElementById('ix-ticket-tif');
    if (tif && String(tif.value || '') === 'FOK') return true;
  }
  return false;
}

function assertTicketFok(input) {
  if (!readTicketFok(input)) return;
  var type = String((input && input.type) || '').toLowerCase();
  var market = type === 'market' || type === 'market_price';
  var price = input && input.price;
  var blank = price == null || String(price).trim() === '';
  if (!market && blank) {
    var err = new Error('FOK limit requires a price; trade does not invent a fill');
    err.code = 'trade.invalid_tif';
    throw err;
  }
}

function bindFok(input) {
  if (!readTicketFok(input)) return input;
  return Object.assign({}, input, { timeInForce: 'FOK' });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindFok(input);
    assertTicketFok(bound);
    var body = origCreate(bound);
    if (bound && bound.timeInForce === 'FOK') {
      body.timeInForce = 'FOK';
      delete body.resting;
      delete body.leftover;
      delete body.fills;
    }
    return body;
  };
  trade.readTicketFok = readTicketFok;
  trade.assertTicketFok = assertTicketFok;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No leftover was rested.';
    if (reason === 'fok_unfillable' || reason === 'trade.fok_unfillable') {
      return 'Fill-or-kill could not fill completely. The whole order was cancelled. ' + verb;
    }
    if (reason === 'invalid_tif' || reason === 'trade.invalid_tif') {
      return 'The order needs a supported time-in-force and required limit price; trade does not invent one. It also does not invent a fill. ' + (action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.');
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  if (order.status === 'cancelled' || order.status === 'CANCELED' || order.status === 'rejected' || order.status === 'REJECTED') {
    return 'cancelled';
  }
  return order.status || null;
}

function ensureTifFok(select) {
  if (!select || !select.options) return;
  var found = false;
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === 'FOK') found = true;
  }
  if (found) return;
  var opt = document.createElement('option');
  opt.value = 'FOK';
  opt.textContent = 'FOK';
  select.appendChild(opt);
}

function ensureFokNote(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-fok-note')) return;
  if (!select || !select.parentNode) return;
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.id = 'ix-ticket-fok-note';
  note.textContent = 'FOK fills completely or cancels the whole. No leftover rest.';
  select.parentNode.appendChild(note);
}

function wrapVuePlace(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__fokWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketFok({
          timeInForce: this.timeInForce,
          type: this.type,
          price: this.price
        });
      } catch (e) {
        return e && e.message ? e.message : 'FOK refused';
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
        if (e && e.code === 'trade.invalid_tif') {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__fokWrapped = true;
}

function installBazaarFokTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  ensureTifFok(select);
  if (root === document) {
    ensureFokNote(select);
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
    if (installBazaarFokTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarFokTicket: installBazaarFokTicket,
  readTicketFok: readTicketFok,
  assertTicketFok: assertTicketFok,
  leftoverStatus: leftoverStatus
};
