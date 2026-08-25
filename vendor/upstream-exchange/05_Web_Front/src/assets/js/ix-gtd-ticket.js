/**
 * Bazaar ticket GTD/GTT rest through the trade place that landed in #3235.
 *
 * Mounts GTD/GTT + expireAt on the existing ticket and refuses a blank
 * expireAt. Matching expires on its engine clock. No invented EOD.
 */
'use strict';

var TIF_VALUES = ['GTD', 'GTT'];
var trade = require('./ix-trade.js');

function readTicketExpireAt(input) {
  if (input && typeof input.expireAt === 'string' && input.expireAt.length > 0) {
    return input.expireAt;
  }
  if (typeof document !== 'undefined') {
    var el = document.getElementById('ix-ticket-expire');
    if (el) {
      var typed = String(el.value || '').trim();
      if (typed) return typed;
    }
  }
  return '';
}

function assertTicketExpire(input) {
  var tif = String((input && input.timeInForce) || '');
  if (tif !== 'GTD' && tif !== 'GTT') return;
  if (readTicketExpireAt(input)) return;
  var err = new Error('GTD/GTT requires expireAt; the engine does not invent one');
  err.code = 'trade.missing_expire_at';
  throw err;
}

function bindExpire(input) {
  var expireAt = readTicketExpireAt(input);
  return expireAt ? Object.assign({}, input, { expireAt: expireAt }) : input;
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindExpire(input);
    assertTicketExpire(bound);
    var body = origCreate(bound);
    if (bound && bound.expireAt) body.expireAt = String(bound.expireAt);
    return body;
  };
  trade.readTicketExpireAt = readTicketExpireAt;
  trade.assertTicketExpire = assertTicketExpire;
}

if (trade && typeof trade.toDeskOrder === 'function') {
  var origDesk = trade.toDeskOrder;
  trade.toDeskOrder = function (order) {
    var row = origDesk(order);
    if (row && !(row.expireAt) && order && order.expireAt) row.expireAt = order.expireAt;
    return row;
  };
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'missing_expire_at' || reason === 'trade.missing_expire_at') {
      return 'GTD/GTT requires expireAt; the engine does not invent one. ' + verb;
    }
    if (reason === 'engine_clock_missing' || reason === 'trade.engine_clock_missing') {
      return 'The matching clock is missing. ' + verb;
    }
    return origFail(result, action);
  };
}

var preview = require('./spot-order-preview.js');
if (preview && typeof preview.toRequest === 'function') {
  var origPreview = preview.toRequest;
  preview.toRequest = function (input) {
    var bound = bindExpire(input);
    try { assertTicketExpire(bound); } catch (e) {
      return { ok: false, reason: 'expireAt' };
    }
    var out = origPreview(bound);
    if (out && out.ok && bound && bound.expireAt) out.body.expireAt = String(bound.expireAt);
    return out;
  };
}

function ensureTifOptions(select) {
  if (!select || !select.options) return;
  TIF_VALUES.forEach(function (value) {
    var found = false;
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) found = true;
    }
    if (found) return;
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

function ensureExpireField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-expire')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-expire-wrap';
  var label = document.createElement('label');
  label.setAttribute('for', 'ix-ticket-expire');
  label.textContent = 'Expires at';
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = 'ix-ticket-expire';
  input.type = 'text';
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');
  input.placeholder = '2026-08-26T12:00:00.000Z';
  input.setAttribute('aria-label', 'GTD/GTT expireAt');
  inputWrap.appendChild(input);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Required for GTD/GTT. The engine does not invent one.';
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
  if (!vm || vm.__gtdExpireWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      var tif = String(this.timeInForce || '');
      if (tif !== 'GTD' && tif !== 'GTT') return '';
      var expireAt = '';
      if (typeof document !== 'undefined') {
        var box = document.getElementById('ix-ticket-expire');
        expireAt = box ? String(box.value || '').trim() : '';
      }
      if (!expireAt) return 'GTD/GTT requires expireAt; the engine does not invent one';
      return '';
    };
  }
  var origPlace = vm.placeOrder;
  if (typeof origPlace === 'function') {
    vm.placeOrder = function () {
      try {
        return origPlace.apply(this, arguments);
      } catch (e) {
        if (e && e.code === 'trade.missing_expire_at') {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__gtdExpireWrapped = true;
}

function installBazaarGtdTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  ensureTifOptions(select);
  if (root === document) ensureExpireField(select);
  var ticket = root.getElementById('ix-ticket');
  if (root === document) wrapVuePlace(ticket || select);
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarGtdTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarGtdTicket: installBazaarGtdTicket,
  ensureTifOptions: ensureTifOptions,
  readTicketExpireAt: readTicketExpireAt,
  assertTicketExpire: assertTicketExpire
};
