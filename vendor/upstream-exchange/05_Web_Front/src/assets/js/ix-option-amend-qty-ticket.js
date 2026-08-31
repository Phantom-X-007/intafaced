/**
 * Bazaar ticket: amend qty on a resting option through trade.
 * Refuse if strike, expiry, or qty is missing. Ticket does not invent a mark.
 * Wires the trade qty amend. Not a redo of #3577 (that was price).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function priceGiven(input) {
  if (!input) return false;
  if (input.price !== undefined && input.price !== null && String(input.price).trim()) return true;
  return false;
}

function qtyGiven(input) {
  if (!input) return false;
  if (input.qty !== undefined && input.qty !== null && String(input.qty).trim()) return true;
  if (input.amount !== undefined && input.amount !== null && String(input.amount).trim() && (input.strike !== undefined || input.expiry !== undefined || input.amendQty === true)) return true;
  return false;
}

function readTicketOptionAmendQty(input) {
  if (input && input.replace === true) return false;
  if (input && priceGiven(input) && qtyGiven(input)) return false;
  if (input && priceGiven(input) && !qtyGiven(input)) return false;
  if (input && input.amendQty === true) return true;
  if (input && (input.strike !== undefined || input.expiry !== undefined) && qtyGiven(input) && !priceGiven(input)) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-amend-qty');
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
  return readDecimal(input, 'strike', 'ix-ticket-option-amend-qty-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-amend-qty-expiry');
  return typed ? typed : null;
}

function readQty(input) {
  if (input && input.qty !== undefined && input.qty !== null) {
    var fromQty = String(input.qty).trim();
    if (fromQty) return fromQty;
  }
  if (input && input.amount !== undefined && input.amount !== null) {
    var fromAmount = String(input.amount).trim();
    if (fromAmount) return fromAmount;
  }
  var typed = readField('ix-ticket-option-amend-qty-value');
  return typed ? typed : null;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionAmendQty(input) {
  if (!readTicketOptionAmendQty(input)) return;
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
  if (!positiveMoney(readQty(input))) {
    var missingQty = new Error('an option amend requires a qty; trade does not invent a mark');
    missingQty.code = 'trade.missing_qty';
    throw missingQty;
  }
}

function bindOptionAmendQty(input) {
  if (!readTicketOptionAmendQty(input)) return input;
  var qty = readQty(input);
  return Object.assign({}, input, {
    amendQty: true,
    strike: readStrike(input),
    expiry: readExpiry(input),
    qty: qty,
    amount: qty
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'replace')) delete body.replace;
  if (Object.prototype.hasOwnProperty.call(body, 'price')) delete body.price;
  return body;
}

if (trade && typeof trade.toAmendOrderBody === 'function') {
  var origAmend = trade.toAmendOrderBody;
  trade.toAmendOrderBody = function (input) {
    if (!readTicketOptionAmendQty(input)) return origAmend(input);
    var bound = bindOptionAmendQty(input);
    assertTicketOptionAmendQty(bound);
    return stripMark({
      amount: bound.qty == null ? null : String(bound.qty),
      qty: bound.qty == null ? null : String(bound.qty),
      strike: bound.strike == null ? null : String(bound.strike),
      expiry: bound.expiry == null ? null : String(bound.expiry)
    });
  };
  trade.readTicketOptionAmendQty = readTicketOptionAmendQty;
  trade.assertTicketOptionAmendQty = assertTicketOptionAmendQty;
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
    if (reason === 'missing_qty' || reason === 'trade.missing_qty') {
      return 'an option amend requires a qty; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionAmendQtyField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-amend-qty')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-amend-qty-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-amend-qty');
  boxLabel.textContent = 'Amend option qty';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-amend-qty';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Amend resting option qty');
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
  addText('ix-ticket-option-amend-qty-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-amend-qty-expiry', 'Expiry', 'Option expiry');
  addText('ix-ticket-option-amend-qty-value', 'Qty', 'Amend qty');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Amends qty through trade. Trade does not invent a mark.';
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueAmendQty(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__optionAmendQtyWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionAmendQty({
          amendQty: this.amendQty === true,
          replace: this.replace === true,
          strike: this.strike,
          expiry: this.expiry,
          price: this.price,
          qty: this.qty,
          amount: this.amount
        });
      } catch (e) {
        return e && e.message ? e.message : 'option amend refused';
      }
      return '';
    };
  }
  vm.__optionAmendQtyWrapped = true;
}

function installBazaarOptionAmendQtyTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionAmendQtyField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueAmendQty(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarOptionAmendQtyTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionAmendQtyTicket: installBazaarOptionAmendQtyTicket,
  readTicketOptionAmendQty: readTicketOptionAmendQty,
  assertTicketOptionAmendQty: assertTicketOptionAmendQty,
  leftoverStatus: leftoverStatus
};
