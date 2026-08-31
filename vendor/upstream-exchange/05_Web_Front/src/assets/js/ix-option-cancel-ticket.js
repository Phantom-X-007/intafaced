/**
 * Bazaar ticket: cancel a resting option through trade.
 * Refuse if strike or expiry is missing. Ticket does not invent a mark.
 * Remainder leaves. Not a redo of #3582 (that was amend qty).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketOptionCancel(input) {
  if (input && input.replace === true) return false;
  if (input && input.amendQty === true) return false;
  if (input && input.amend === true && input.cancel !== true) return false;
  if (input && input.cancel === true) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-cancel');
    if (box && box.checked === true) return true;
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

function readStrike(input) {
  return readDecimal(input, 'strike', 'ix-ticket-option-cancel-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-cancel-expiry');
  return typed ? typed : null;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionCancel(input) {
  if (!readTicketOptionCancel(input)) return;
  if (!positiveMoney(readStrike(input))) {
    var missingStrike = new Error('an option cancel requires a strike; trade does not invent a mark');
    missingStrike.code = 'trade.missing_strike';
    throw missingStrike;
  }
  var expiry = readExpiry(input);
  if (expiry == null || expiry.length === 0) {
    var missingExpiry = new Error('an option cancel requires an expiry; trade does not invent a mark');
    missingExpiry.code = 'trade.missing_expiry';
    throw missingExpiry;
  }
}

function bindOptionCancel(input) {
  if (!readTicketOptionCancel(input)) return input;
  return Object.assign({}, input, {
    cancel: true,
    strike: readStrike(input),
    expiry: readExpiry(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'replace')) delete body.replace;
  if (Object.prototype.hasOwnProperty.call(body, 'price')) delete body.price;
  if (Object.prototype.hasOwnProperty.call(body, 'qty')) delete body.qty;
  return body;
}

function optionCancelBody(bound) {
  return stripMark({
    cancel: true,
    strike: bound.strike == null ? null : String(bound.strike),
    expiry: bound.expiry == null ? null : String(bound.expiry)
  });
}

function toCancelOrderBody(input) {
  if (!readTicketOptionCancel(input)) {
    var id = input && (input.orderId || input.id);
    return id ? { orderId: String(id) } : {};
  }
  var bound = bindOptionCancel(input);
  assertTicketOptionCancel(bound);
  return optionCancelBody(bound);
}

if (trade) {
  var origCreate = typeof trade.toCreateOrderBody === 'function' ? trade.toCreateOrderBody : null;
  if (origCreate) {
    trade.toCreateOrderBody = function (input) {
      if (!readTicketOptionCancel(input)) return origCreate(input);
      var bound = bindOptionCancel(input);
      assertTicketOptionCancel(bound);
      return optionCancelBody(bound);
    };
  }
  trade.toCancelOrderBody = toCancelOrderBody;
  trade.readTicketOptionCancel = readTicketOptionCancel;
  trade.assertTicketOptionCancel = assertTicketOptionCancel;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : action === 'amend' || action === 'replace' ? 'The rest was not amended.' : 'No order was placed.';
    if (reason === 'missing_strike' || reason === 'trade.missing_strike') {
      return 'an option cancel requires a strike; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_expiry' || reason === 'trade.missing_expiry') {
      return 'an option cancel requires an expiry; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionCancelField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-cancel')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-cancel-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-cancel');
  boxLabel.textContent = 'Cancel option';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-cancel';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Cancel resting option');
  boxWrap.appendChild(box);
  function addText(id, labelText, aria) {
    var lab = document.createElement('label');
    lab.setAttribute('for', id);
    lab.textContent = labelText;
    var wrap = document.createElement('div');
    wrap.className = 'ix-input';
    var inp = document.createElement('input');
    inp.id = id;
    inp.type = 'text';
    inp.spellcheck = false;
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('aria-label', aria);
    wrap.appendChild(inp);
    field.appendChild(lab);
    field.appendChild(wrap);
  }
  field.appendChild(boxLabel);
  field.appendChild(boxWrap);
  addText('ix-ticket-option-cancel-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-cancel-expiry', 'Expiry', 'Option expiry');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Cancels through trade. Remainder leaves. Trade does not invent a mark.';
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueCancel(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__optionCancelWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionCancel({
          cancel: this.cancel === true,
          replace: this.replace === true,
          amendQty: this.amendQty === true,
          amend: this.amend === true,
          strike: this.strike,
          expiry: this.expiry
        });
      } catch (e) {
        return e && e.message ? e.message : 'option cancel refused';
      }
      return '';
    };
  }
  vm.__optionCancelWrapped = true;
}

function installBazaarOptionCancelTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionCancelField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueCancel(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarOptionCancelTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionCancelTicket: installBazaarOptionCancelTicket,
  readTicketOptionCancel: readTicketOptionCancel,
  assertTicketOptionCancel: assertTicketOptionCancel,
  toCancelOrderBody: toCancelOrderBody,
  leftoverStatus: leftoverStatus
};
