/**
 * Bazaar ticket AON through the trade place that landed in #3316.
 * Fill remaining in one sweep or do not stub.
 * Iceberg plus AON refuses. Unchecked is a normal order. Ticket does not invent AON.
 */
'use strict';

var trade = require('./ix-trade.js');

function readTicketAon(input) {
  if (input && input.aon === true) return true;
  if (typeof document !== 'undefined') {
    var el = document.getElementById('ix-ticket-aon');
    if (el && el.checked === true) return true;
  }
  return false;
}

function readTicketIceberg(input) {
  if (input && (input.iceberg === true || input.displayQty !== undefined)) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-iceberg');
    if (box && box.checked === true) return true;
    var display = document.getElementById('ix-ticket-iceberg-display');
    if (display && String(display.value || '').trim()) return true;
  }
  return false;
}

function assertTicketAon(input) {
  if (!readTicketAon(input)) return;
  if (!readTicketIceberg(input)) return;
  var err = new Error('all-or-none cannot hide a stub behind a display; trade does not invent a fill');
  err.code = 'trade.aon_iceberg';
  throw err;
}

function bindAon(input) {
  if (!readTicketAon(input)) return input;
  return Object.assign({}, input, { aon: true });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindAon(input);
    assertTicketAon(bound);
    var body = origCreate(bound);
    if (bound && bound.aon === true) body.aon = true;
    return body;
  };
  trade.readTicketAon = readTicketAon;
  trade.assertTicketAon = assertTicketAon;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'aon_iceberg' || reason === 'trade.aon_iceberg') {
      return 'all-or-none cannot hide a stub behind a display; trade does not invent a fill. ' + verb;
    }
    return origFail(result, action);
  };
}

function ensureAonField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-aon')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-aon-wrap';
  var label = document.createElement('label');
  label.setAttribute('for', 'ix-ticket-aon');
  label.textContent = 'All or none';
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = 'ix-ticket-aon';
  input.type = 'checkbox';
  input.setAttribute('aria-label', 'All or none');
  inputWrap.appendChild(input);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Fill remaining in one sweep or do not stub. Iceberg plus AON refuses. Unchecked is a normal order.';
  field.appendChild(label);
  field.appendChild(inputWrap);
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
  if (!vm || vm.__aonWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        var form = this.form || {};
        assertTicketAon({
          aon: this.aon === true,
          iceberg: this.iceberg === true,
          displayQty: form.displayQty != null ? form.displayQty : this.displayQty
        });
      } catch (e) {
        return e && e.message ? e.message : 'AON refused';
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
        if (e && e.code === 'trade.aon_iceberg') {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__aonWrapped = true;
}

function installBazaarAonTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureAonField(select);
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
    if (installBazaarAonTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarAonTicket: installBazaarAonTicket,
  readTicketAon: readTicketAon,
  assertTicketAon: assertTicketAon
};
