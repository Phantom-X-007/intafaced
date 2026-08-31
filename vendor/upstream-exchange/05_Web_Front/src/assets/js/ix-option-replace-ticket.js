/**
 * Bazaar ticket: replace a resting option (price and qty together) through trade.
 * Refuse if strike, expiry, price, or qty is missing. Ticket does not invent a mark.
 * Wires the trade replace that landed in #3566. Stay in 05_Web_Front.
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketOptionReplace(input) {
  if (input && input.replace === true) return true;
  if (input && (input.strike !== undefined || input.expiry !== undefined) && input.price !== undefined && (input.qty !== undefined || input.amount !== undefined)) {
    return true;
  }
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-replace');
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
  return readDecimal(input, 'strike', 'ix-ticket-option-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-expiry');
  return typed ? typed : null;
}

function readPrice(input) {
  return readDecimal(input, 'price', 'ix-ticket-option-price');
}

function readQty(input) {
  if (input && input.qty !== undefined && input.qty !== null) {
    var fromQty = String(input.qty).trim();
    if (fromQty) return fromQty;
    return null;
  }
  if (input && input.amount !== undefined && input.amount !== null) {
    var fromAmount = String(input.amount).trim();
    if (fromAmount) return fromAmount;
    return null;
  }
  var typed = readField('ix-ticket-option-qty');
  return typed ? typed : null;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionReplace(input) {
  if (!readTicketOptionReplace(input)) return;
  if (!positiveMoney(readStrike(input))) {
    var missingStrike = new Error('an option replace requires a strike; trade does not invent a mark');
    missingStrike.code = 'trade.missing_strike';
    throw missingStrike;
  }
  var expiry = readExpiry(input);
  if (expiry == null || expiry.length === 0) {
    var missingExpiry = new Error('an option replace requires an expiry; trade does not invent a mark');
    missingExpiry.code = 'trade.missing_expiry';
    throw missingExpiry;
  }
  if (!positiveMoney(readPrice(input))) {
    var missingPrice = new Error('an option replace requires a price; trade does not invent a mark');
    missingPrice.code = 'trade.missing_price';
    throw missingPrice;
  }
  if (!positiveMoney(readQty(input))) {
    var missingQty = new Error('an option replace requires a qty; trade does not invent a mark');
    missingQty.code = 'trade.missing_qty';
    throw missingQty;
  }
}

function bindOptionReplace(input) {
  if (!readTicketOptionReplace(input)) return input;
  return Object.assign({}, input, {
    replace: true,
    strike: readStrike(input),
    expiry: readExpiry(input),
    price: readPrice(input),
    qty: readQty(input),
    amount: readQty(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  return body;
}

function applyReplaceFields(body, bound) {
  body.replace = true;
  body.strike = bound.strike == null ? null : String(bound.strike);
  body.expiry = bound.expiry == null ? null : String(bound.expiry);
  body.price = bound.price == null ? null : String(bound.price);
  body.amount = bound.qty == null ? null : String(bound.qty);
  body.qty = body.amount;
  return stripMark(body);
}

if (trade && typeof trade.toReplaceOrderBody === 'function') {
  var origReplace = trade.toReplaceOrderBody;
  trade.toReplaceOrderBody = function (input) {
    if (!readTicketOptionReplace(input)) return origReplace(input);
    var bound = bindOptionReplace(input);
    assertTicketOptionReplace(bound);
    var body = origReplace(bound);
    return applyReplaceFields(body, bound);
  };
  trade.readTicketOptionReplace = readTicketOptionReplace;
  trade.assertTicketOptionReplace = assertTicketOptionReplace;
}

if (trade && typeof trade.toAmendOrderBody === 'function') {
  var origAmend = trade.toAmendOrderBody;
  trade.toAmendOrderBody = function (input) {
    if (!readTicketOptionReplace(input)) return origAmend(input);
    var bound = bindOptionReplace(input);
    assertTicketOptionReplace(bound);
    var body = origAmend(bound);
    return applyReplaceFields(body, bound);
  };
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : action === 'replace' || action === 'amend' ? 'The rest was not replaced.' : 'No order was placed.';
    if (reason === 'missing_strike' || reason === 'trade.missing_strike') {
      return 'an option replace requires a strike; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_expiry' || reason === 'trade.missing_expiry') {
      return 'an option replace requires an expiry; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_price' || reason === 'trade.missing_price') {
      return 'an option replace requires a price; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_qty' || reason === 'trade.missing_qty') {
      return 'an option replace requires a qty; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionReplaceField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-replace')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-replace-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-replace');
  boxLabel.textContent = 'Replace option';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-replace';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Replace resting option');
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
  addText('ix-ticket-option-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-expiry', 'Expiry', 'Option expiry');
  addText('ix-ticket-option-price', 'Price', 'Replace price');
  addText('ix-ticket-option-qty', 'Qty', 'Replace qty');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Replaces price and qty together through trade. Trade does not invent a mark.';
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueReplace(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__optionReplaceWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionReplace({
          replace: this.replace === true,
          strike: this.strike,
          expiry: this.expiry,
          price: this.price,
          qty: this.qty || this.amount,
          amount: this.amount || this.qty
        });
      } catch (e) {
        return e && e.message ? e.message : 'option replace refused';
      }
      return '';
    };
  }
  vm.__optionReplaceWrapped = true;
}

function installBazaarOptionReplaceTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionReplaceField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueReplace(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarOptionReplaceTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionReplaceTicket: installBazaarOptionReplaceTicket,
  readTicketOptionReplace: readTicketOptionReplace,
  assertTicketOptionReplace: assertTicketOptionReplace,
  leftoverStatus: leftoverStatus
};
