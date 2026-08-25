/**
 * Bazaar ticket IOC through the trade place that landed in #3272.
 * Take what is there. Unfilled remainder cancels. Ticket does not invent a leftover rest.
 */
'use strict';

var trade = require('./ix-trade.js');

function readTicketIoc(input) {
  if (input && (input.timeInForce === 'IOC' || input.tif === 'IOC')) return true;
  if (typeof document !== 'undefined') {
    var tif = document.getElementById('ix-ticket-tif');
    if (tif && String(tif.value || '') === 'IOC') return true;
  }
  return false;
}

function assertTicketIoc(input) {
  if (!readTicketIoc(input)) return;
  var type = String((input && input.type) || '').toLowerCase();
  var market = type === 'market' || type === 'market_price';
  var price = input && input.price;
  var blank = price == null || String(price).trim() === '';
  if (!market && blank) {
    var err = new Error('IOC limit requires a price; trade does not invent one');
    err.code = 'trade.invalid_tif';
    throw err;
  }
}

function bindIoc(input) {
  if (!readTicketIoc(input)) return input;
  return Object.assign({}, input, { timeInForce: 'IOC' });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindIoc(input);
    assertTicketIoc(bound);
    var body = origCreate(bound);
    if (bound && bound.timeInForce === 'IOC') {
      body.timeInForce = 'IOC';
      delete body.resting;
      delete body.leftover;
    }
    return body;
  };
  trade.readTicketIoc = readTicketIoc;
  trade.assertTicketIoc = assertTicketIoc;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No leftover was rested.';
    if (reason === 'ioc_remainder' || reason === 'trade.ioc_remainder') {
      return 'Unfilled remainder cancelled. ' + verb;
    }
    if (reason === 'market_remainder' || reason === 'trade.market_remainder') {
      return 'Unfilled remainder cancelled. ' + verb;
    }
    if (reason === 'invalid_tif' || reason === 'trade.invalid_tif') {
      return 'IOC limit requires a price; trade does not invent one. ' + (action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.');
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  if (order.status === 'cancelled' || order.status === 'CANCELED') return 'cancelled';
  return order.status || null;
}

function ensureTifIoc(select) {
  if (!select || !select.options) return;
  var found = false;
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === 'IOC') found = true;
  }
  if (found) return;
  var opt = document.createElement('option');
  opt.value = 'IOC';
  opt.textContent = 'IOC';
  select.appendChild(opt);
}

function ensureIocNote(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-ioc-note')) return;
  if (!select || !select.parentNode) return;
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.id = 'ix-ticket-ioc-note';
  note.textContent = 'IOC takes what is there. Unfilled remainder cancels. No leftover rest.';
  select.parentNode.appendChild(note);
}

function wrapVuePlace(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__iocWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketIoc({
          timeInForce: this.timeInForce,
          type: this.type,
          price: this.price
        });
      } catch (e) {
        return e && e.message ? e.message : 'IOC refused';
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
  vm.__iocWrapped = true;
}

function installBazaarIocTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  ensureTifIoc(select);
  if (root === document) {
    ensureIocNote(select);
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
    if (installBazaarIocTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarIocTicket: installBazaarIocTicket,
  readTicketIoc: readTicketIoc,
  assertTicketIoc: assertTicketIoc,
  leftoverStatus: leftoverStatus
};
