/**
 * Bazaar ticket: amend price on a resting option through trade.
 * Refuse if strike, expiry, or price is missing. Ticket does not invent a mark.
 * Wires the trade price amend that landed in #3555. Not a redo of #3573 (that was replace).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function qtyGiven(input) {
  if (!input) return false;
  if (input.qty !== undefined && input.qty !== null && String(input.qty).trim()) return true;
  return false;
}

function readTicketOptionAmendPrice(input) {
  if (input && input.replace === true) return false;
  if (input && qtyGiven(input) && input.price !== undefined) return false;
  if (input && input.amend === true) return true;
  if (input && (input.strike !== undefined || input.expiry !== undefined) && input.price !== undefined && !qtyGiven(input)) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-amend-price');
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
  return readDecimal(input, 'strike', 'ix-ticket-option-amend-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-amend-expiry');
  return typed ? typed : null;
}

function readPrice(input) {
  return readDecimal(input, 'price', 'ix-ticket-option-amend-price-value');
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionAmendPrice(input) {
  if (!readTicketOptionAmendPrice(input)) return;
  if (!positiveMoney(readStrike(input))) {
    var missingStrike = new Error('an option amend requires a strike; trade does not invent a mark');
    missingStrike.code = 'trade.missing_strike';
    throw missingStrike;
  }
  var expiry = readExpiry(input);
  if (expiry == null || expiry.length === 0) {
    var missingExpiry = new Error('an option amend requires an expiry; trade does not invent a mark');
    missingExpiry.code = 'trade.missing_expiry';
    throw missingExpiry;
  }
  if (!positiveMoney(readPrice(input))) {
    var missingPrice = new Error('an option amend requires a price; trade does not invent a mark');
    missingPrice.code = 'trade.missing_price';
    throw missingPrice;
  }
}

function bindOptionAmendPrice(input) {
  if (!readTicketOptionAmendPrice(input)) return input;
  return Object.assign({}, input, {
    amend: true,
    strike: readStrike(input),
    expiry: readExpiry(input),
    price: readPrice(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'replace')) delete body.replace;
  if (Object.prototype.hasOwnProperty.call(body, 'qty')) delete body.qty;
  return body;
}

if (trade && typeof trade.toAmendOrderBody === 'function') {
  var origAmend = trade.toAmendOrderBody;
  trade.toAmendOrderBody = function (input) {
    if (!readTicketOptionAmendPrice(input)) return origAmend(input);
    var bound = bindOptionAmendPrice(input);
    assertTicketOptionAmendPrice(bound);
    return stripMark({
      price: bound.price == null ? null : String(bound.price),
      strike: bound.strike == null ? null : String(bound.strike),
      expiry: bound.expiry == null ? null : String(bound.expiry)
    });
  };
  trade.readTicketOptionAmendPrice = readTicketOptionAmendPrice;
  trade.assertTicketOptionAmendPrice = assertTicketOptionAmendPrice;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : action === 'amend' || action === 'replace' ? 'The rest was not amended.' : 'No order was placed.';
    if (reason === 'missing_strike' || reason === 'trade.missing_strike') {
      return 'an option amend requires a strike; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_expiry' || reason === 'trade.missing_expiry') {
      return 'an option amend requires an expiry; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_price' || reason === 'trade.missing_price') {
      return 'an option amend requires a price; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionAmendPriceField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-amend-price')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-amend-price-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-amend-price');
  boxLabel.textContent = 'Amend option price';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-amend-price';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Amend resting option price');
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
  addText('ix-ticket-option-amend-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-amend-expiry', 'Expiry', 'Option expiry');
  addText('ix-ticket-option-amend-price-value', 'Price', 'Amend price');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Amends price through trade. Trade does not invent a mark.';
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueAmend(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__optionAmendPriceWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionAmendPrice({
          amend: this.amend === true,
          replace: this.replace === true,
          strike: this.strike,
          expiry: this.expiry,
          price: this.price,
          qty: this.qty
        });
      } catch (e) {
        return e && e.message ? e.message : 'option amend refused';
      }
      return '';
    };
  }
  vm.__optionAmendPriceWrapped = true;
}

function installBazaarOptionAmendPriceTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionAmendPriceField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueAmend(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarOptionAmendPriceTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionAmendPriceTicket: installBazaarOptionAmendPriceTicket,
  readTicketOptionAmendPrice: readTicketOptionAmendPrice,
  assertTicketOptionAmendPrice: assertTicketOptionAmendPrice,
  leftoverStatus: leftoverStatus
};
