/**
 * Bazaar ticket peg / midpoint / relative through the trade place that landed in #3324.
 * Unsupported intent refuses rather than becoming a silent limit.
 * Missing or false is a normal order. Ticket does not invent a mid.
 */
'use strict';

var trade = require('./ix-trade.js');

function readBox(input, key, id) {
  if (input && input[key] === true) return true;
  if (typeof document !== 'undefined') {
    var el = document.getElementById(id);
    if (el && el.checked === true) return true;
  }
  return false;
}

function readTicketPeg(input) {
  return readBox(input, 'peg', 'ix-ticket-peg');
}

function readTicketMidpoint(input) {
  return readBox(input, 'midpoint', 'ix-ticket-midpoint');
}

function readTicketRelative(input) {
  return readBox(input, 'relative', 'ix-ticket-relative');
}

function refuse(code, message) {
  var err = new Error(message);
  err.code = code;
  throw err;
}

function assertTicketPeg(input) {
  if (readTicketPeg(input)) {
    refuse('trade.peg_unsupported', 'pegged orders are unsupported; trade does not invent a reference price');
  }
  if (readTicketMidpoint(input)) {
    refuse('trade.midpoint_unsupported', 'midpoint orders are unsupported; trade does not invent a mid');
  }
  if (readTicketRelative(input)) {
    refuse('trade.relative_unsupported', 'relative orders are unsupported; trade does not invent a reference price');
  }
}

function bindPeg(input) {
  if (!input) return input;
  var next = input;
  if (readTicketPeg(input)) next = Object.assign({}, next, { peg: true });
  if (readTicketMidpoint(input)) next = Object.assign({}, next, { midpoint: true });
  if (readTicketRelative(input)) next = Object.assign({}, next, { relative: true });
  return next;
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindPeg(input);
    assertTicketPeg(bound);
    return origCreate(bound);
  };
  trade.readTicketPeg = readTicketPeg;
  trade.assertTicketPeg = assertTicketPeg;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'peg_unsupported' || reason === 'trade.peg_unsupported') {
      return 'pegged orders are unsupported; trade does not invent a reference price. ' + verb;
    }
    if (reason === 'midpoint_unsupported' || reason === 'trade.midpoint_unsupported') {
      return 'midpoint orders are unsupported; trade does not invent a mid. ' + verb;
    }
    if (reason === 'relative_unsupported' || reason === 'trade.relative_unsupported') {
      return 'relative orders are unsupported; trade does not invent a reference price. ' + verb;
    }
    return origFail(result, action);
  };
}

function addBox(field, id, labelText) {
  var label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelText;
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = id;
  input.type = 'checkbox';
  input.setAttribute('aria-label', labelText);
  inputWrap.appendChild(input);
  field.appendChild(label);
  field.appendChild(inputWrap);
}

function ensurePegField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-peg')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-peg-wrap';
  addBox(field, 'ix-ticket-peg', 'Peg');
  addBox(field, 'ix-ticket-midpoint', 'Midpoint');
  addBox(field, 'ix-ticket-relative', 'Relative');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Unsupported peg, midpoint, and relative refuse. Trade does not invent a mid. Unchecked is a normal order.';
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
  if (!vm || vm.__pegWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketPeg({
          peg: this.peg === true,
          midpoint: this.midpoint === true,
          relative: this.relative === true
        });
      } catch (e) {
        return e && e.message ? e.message : 'peg refused';
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
          (e.code === 'trade.peg_unsupported' ||
            e.code === 'trade.midpoint_unsupported' ||
            e.code === 'trade.relative_unsupported')
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
  vm.__pegWrapped = true;
}

function installBazaarPegTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensurePegField(select);
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
    if (installBazaarPegTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarPegTicket: installBazaarPegTicket,
  readTicketPeg: readTicketPeg,
  readTicketMidpoint: readTicketMidpoint,
  readTicketRelative: readTicketRelative,
  assertTicketPeg: assertTicketPeg
};
