/**
 * Bazaar ticket post-only rest through the trade place that landed in #3264.
 *
 * Forwards tif PO (or postOnly true) to the trade place. Matching owns the
 * book. Trade does not invent a price. Matching refuse post_only_would_cross
 * is the ticket refuse. Market or missing price throws trade.invalid_tif.
 */
'use strict';

var trade = require('./ix-trade.js');

function readTicketPostOnly(input) {
  if (input && (input.postOnly === true || input.timeInForce === 'PO' || input.tif === 'PO')) {
    return true;
  }
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-post-only');
    if (box && box.checked === true) return true;
    var tif = document.getElementById('ix-ticket-tif');
    if (tif && String(tif.value || '') === 'PO') return true;
  }
  return false;
}

function assertTicketPostOnly(input) {
  if (!readTicketPostOnly(input)) return;
  var type = String((input && input.type) || '').toLowerCase();
  var market = type === 'market' || type === 'market_price';
  var price = input && input.price;
  var blank = price == null || String(price).trim() === '';
  if (market || blank) {
    var err = new Error('post-only requires a limit price; trade does not invent one');
    err.code = 'trade.invalid_tif';
    throw err;
  }
}

function bindPostOnly(input) {
  if (!readTicketPostOnly(input)) return input;
  return Object.assign({}, input, { postOnly: true, timeInForce: 'PO' });
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindPostOnly(input);
    assertTicketPostOnly(bound);
    var body = origCreate(bound);
    if (bound && (bound.postOnly === true || bound.timeInForce === 'PO')) {
      body.timeInForce = 'PO';
      body.postOnly = true;
    }
    return body;
  };
  trade.readTicketPostOnly = readTicketPostOnly;
  trade.assertTicketPostOnly = assertTicketPostOnly;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'post_only_would_cross' || reason === 'trade.post_only_would_cross') {
      return 'This post-only would take. ' + verb;
    }
    if (reason === 'invalid_tif' || reason === 'trade.invalid_tif') {
      return 'post-only requires a limit price; trade does not invent one. ' + verb;
    }
    return origFail(result, action);
  };
}

function ensureTifPo(select) {
  if (!select || !select.options) return;
  var found = false;
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === 'PO') found = true;
  }
  if (found) return;
  var opt = document.createElement('option');
  opt.value = 'PO';
  opt.textContent = 'PO';
  select.appendChild(opt);
}

function ensurePostOnlyField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-post-only')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-post-only-wrap';
  var label = document.createElement('label');
  label.setAttribute('for', 'ix-ticket-post-only');
  label.textContent = 'Post only';
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = 'ix-ticket-post-only';
  input.type = 'checkbox';
  input.setAttribute('aria-label', 'Post only');
  inputWrap.appendChild(input);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Matching refuses if this would take. No invented price.';
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
  if (!vm || vm.__postOnlyWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketPostOnly({
          postOnly: this.postOnly === true,
          timeInForce: this.timeInForce,
          type: this.type,
          price: this.price
        });
      } catch (e) {
        return e && e.message ? e.message : 'post-only refused';
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
  vm.__postOnlyWrapped = true;
}

function installBazaarPostOnlyTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  ensureTifPo(select);
  if (root === document) {
    ensurePostOnlyField(select);
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
    if (installBazaarPostOnlyTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarPostOnlyTicket: installBazaarPostOnlyTicket,
  readTicketPostOnly: readTicketPostOnly,
  assertTicketPostOnly: assertTicketPostOnly
};
