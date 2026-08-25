/**
 * Bazaar ticket min qty through the trade place that landed in #3308.
 * A fill below the floor does not occur.
 * Missing or zero is a normal order. Ticket does not invent a clip.
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');
var preview = require('./spot-order-preview.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketMinQty(input) {
  if (input && input.minQty !== undefined) return true;
  if (typeof document !== 'undefined') {
    if (readField('ix-ticket-min-qty')) return true;
  }
  return false;
}

function readDecimal(input, key, fieldId) {
  if (input && input[key] !== undefined && input[key] !== null) {
    var fromInput = String(input[key]).trim();
    if (fromInput) return fromInput;
    return null;
  }
  var typed = readField(fieldId);
  return typed ? typed : null;
}

function readMinQty(input) {
  return readDecimal(input, 'minQty', 'ix-ticket-min-qty');
}

function readQty(input) {
  if (!input) return null;
  var raw = input.amount != null ? input.amount : input.qty;
  if (raw == null) return null;
  var s = String(raw).trim();
  return s ? s : null;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function exceedsQty(minQty, qty) {
  if (typeof ixMoney.greaterThan === 'function') return ixMoney.greaterThan(minQty, qty);
  if (typeof ixMoney.compare !== 'function') return false;
  var cmp = ixMoney.compare(minQty, qty);
  return cmp !== null && cmp > 0;
}

function assertTicketMinQty(input) {
  var minQty = readMinQty(input);
  if (!positiveMoney(minQty)) return;
  var qty = readQty(input);
  if (qty != null && exceedsQty(minQty, qty)) {
    var over = new Error('minQty must not exceed remaining qty; trade does not invent a fill');
    over.code = 'trade.min_qty_exceeds_qty';
    throw over;
  }
}

function bindMinQty(input) {
  if (!readTicketMinQty(input)) return input;
  return Object.assign({}, input, { minQty: readMinQty(input) });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindMinQty(input);
    assertTicketMinQty(bound);
    var body = origCreate(bound);
    var floor = readMinQty(bound);
    if (positiveMoney(floor)) body.minQty = String(floor);
    return body;
  };
  trade.readTicketMinQty = readTicketMinQty;
  trade.assertTicketMinQty = assertTicketMinQty;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'min_qty_exceeds_qty' || reason === 'trade.min_qty_exceeds_qty') {
      return 'minQty must not exceed remaining qty; trade does not invent a fill. ' + verb;
    }
    return origFail(result, action);
  };
}

if (preview && typeof preview.toRequest === 'function') {
  var origPreview = preview.toRequest;
  preview.toRequest = function (input) {
    var bound = bindMinQty(input);
    try {
      assertTicketMinQty(bound);
    } catch (e) {
      return { ok: false, reason: 'minQty' };
    }
    var out = origPreview(bound);
    var floor = readMinQty(bound);
    if (out && out.ok && positiveMoney(floor)) out.body.minQty = String(floor);
    return out;
  };
}

function ensureMinQtyField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-min-qty')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-min-qty-wrap';
  var label = document.createElement('label');
  label.setAttribute('for', 'ix-ticket-min-qty');
  label.textContent = 'Min qty';
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = 'ix-ticket-min-qty';
  input.type = 'text';
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', 'Min qty');
  inputWrap.appendChild(input);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'A fill below the floor does not occur. Missing or zero is a normal order.';
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
  if (!vm || vm.__minQtyWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        var form = this.form || {};
        assertTicketMinQty({
          minQty: form.minQty != null ? form.minQty : this.minQty,
          amount: form.amount != null ? form.amount : this.amount || this.qty
        });
      } catch (e) {
        return e && e.message ? e.message : 'min qty refused';
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
        if (e && e.code === 'trade.min_qty_exceeds_qty') {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__minQtyWrapped = true;
}

function installBazaarMinQtyTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureMinQtyField(select);
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
    if (installBazaarMinQtyTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarMinQtyTicket: installBazaarMinQtyTicket,
  readTicketMinQty: readTicketMinQty,
  assertTicketMinQty: assertTicketMinQty
};
