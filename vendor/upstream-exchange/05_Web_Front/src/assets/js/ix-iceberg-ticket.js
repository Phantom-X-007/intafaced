/**
 * Bazaar ticket iceberg through the trade place that landed in #3283.
 * Only the display qty is visible. Hidden remainder refills as display takes.
 * Refuse if display is missing or not smaller than total. Ticket does not invent a display.
 */
'use strict';

var trade = require('./ix-trade.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketIceberg(input) {
  if (input && (input.iceberg === true || input.displayQty !== undefined)) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-iceberg');
    if (box && box.checked === true) return true;
    if (readField('ix-ticket-iceberg-display')) return true;
  }
  return false;
}

function readDisplayQty(input) {
  if (input && input.displayQty !== undefined && input.displayQty !== null) {
    var fromInput = String(input.displayQty).trim();
    if (fromInput) return fromInput;
    return null;
  }
  var typed = readField('ix-ticket-iceberg-display');
  return typed ? typed : null;
}

function readTotalQty(input) {
  if (!input) return null;
  var raw = input.amount != null ? input.amount : input.qty;
  if (raw == null) return null;
  var s = String(raw).trim();
  return s ? s : null;
}

function asQty(raw) {
  if (raw == null) return null;
  var s = String(raw).trim();
  if (!s) return null;
  var n = Number(s);
  if (!isFinite(n)) return null;
  return n;
}

function assertTicketIceberg(input) {
  if (!readTicketIceberg(input)) return;
  var display = readDisplayQty(input);
  var displayN = asQty(display);
  if (displayN == null || displayN <= 0) {
    var missing = new Error('iceberg requires a display qty; trade does not invent a display');
    missing.code = 'trade.iceberg_display_missing';
    throw missing;
  }
  var total = asQty(readTotalQty(input));
  if (total != null && displayN >= total) {
    var notSmaller = new Error('iceberg display must be smaller than total; trade does not invent a display');
    notSmaller.code = 'trade.iceberg_display_not_smaller';
    throw notSmaller;
  }
}

function bindIceberg(input) {
  if (!readTicketIceberg(input)) return input;
  var display = readDisplayQty(input);
  return Object.assign({}, input, { iceberg: true, displayQty: display });
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindIceberg(input);
    assertTicketIceberg(bound);
    var body = origCreate(bound);
    if (bound && (bound.iceberg === true || bound.displayQty !== undefined)) {
      body.iceberg = true;
      body.displayQty = bound.displayQty == null ? null : String(bound.displayQty);
    }
    return body;
  };
  trade.readTicketIceberg = readTicketIceberg;
  trade.assertTicketIceberg = assertTicketIceberg;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'iceberg_display_missing' || reason === 'trade.iceberg_display_missing') {
      return 'iceberg requires a display qty; trade does not invent a display. ' + verb;
    }
    if (reason === 'iceberg_display_not_smaller' || reason === 'trade.iceberg_display_not_smaller') {
      return 'iceberg display must be smaller than total; trade does not invent a display. ' + verb;
    }
    return origFail(result, action);
  };
}

function ensureIcebergField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-iceberg')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-iceberg-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-iceberg');
  boxLabel.textContent = 'Iceberg';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-iceberg';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Iceberg');
  boxWrap.appendChild(box);
  var qtyLabel = document.createElement('label');
  qtyLabel.setAttribute('for', 'ix-ticket-iceberg-display');
  qtyLabel.textContent = 'Display qty';
  var qtyWrap = document.createElement('div');
  qtyWrap.className = 'ix-input';
  var qty = document.createElement('input');
  qty.id = 'ix-ticket-iceberg-display';
  qty.type = 'text';
  qty.spellcheck = false;
  qty.setAttribute('autocomplete', 'off');
  qty.setAttribute('aria-label', 'Iceberg display qty');
  qtyWrap.appendChild(qty);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Only the display qty is visible. Hidden remainder refills. Trade does not invent a display.';
  field.appendChild(boxLabel);
  field.appendChild(boxWrap);
  field.appendChild(qtyLabel);
  field.appendChild(qtyWrap);
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
  if (!vm || vm.__icebergWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketIceberg({
          iceberg: this.iceberg === true,
          displayQty: this.displayQty,
          amount: this.amount || this.qty,
          type: this.type,
          price: this.price
        });
      } catch (e) {
        return e && e.message ? e.message : 'iceberg refused';
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
        if (
          e &&
          (e.code === 'trade.iceberg_display_missing' || e.code === 'trade.iceberg_display_not_smaller')
        ) {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__icebergWrapped = true;
}

function installBazaarIcebergTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureIcebergField(select);
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
    if (installBazaarIcebergTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarIcebergTicket: installBazaarIcebergTicket,
  readTicketIceberg: readTicketIceberg,
  assertTicketIceberg: assertTicketIceberg,
  leftoverStatus: leftoverStatus
};
