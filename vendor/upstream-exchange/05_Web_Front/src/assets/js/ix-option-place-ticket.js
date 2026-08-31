/**
 * Bazaar ticket: rest an option through trade.
 * Refuse if strike or expiry is missing. Ticket does not invent a mark.
 * Not a redo of #3612 (bazaar expire) or #3489 (trade place).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketOptionPlace(input) {
  if (input && input.replace === true) return false;
  if (input && input.amendQty === true) return false;
  if (input && input.amend === true) return false;
  if (input && input.cancel === true) return false;
  if (input && input.exercise === true) return false;
  if (input && input.assign === true) return false;
  if (input && input.cover === true) return false;
  if (input && input.expire === true) return false;
  if (input && input.type === 'option') return true;
  if (input && (input.strike !== undefined || input.expiry !== undefined)) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-place');
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
  return readDecimal(input, 'strike', 'ix-ticket-option-place-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-place-expiry');
  return typed ? typed : null;
}

function readPrice(input) {
  return readDecimal(input, 'price', 'ix-ticket-option-place-price');
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionPlace(input) {
  if (!readTicketOptionPlace(input)) return;
  if (!positiveMoney(readStrike(input))) {
    var missingStrike = new Error('an option requires a strike; trade does not invent a mark');
    missingStrike.code = 'trade.missing_strike';
    throw missingStrike;
  }
  var expiry = readExpiry(input);
  if (expiry == null || expiry.length === 0) {
    var missingExpiry = new Error('an option requires an expiry; trade does not invent a mark');
    missingExpiry.code = 'trade.missing_expiry';
    throw missingExpiry;
  }
  if (!positiveMoney(readPrice(input))) {
    var missingPrice = new Error('an option rests as a limit; trade does not invent a mark');
    missingPrice.code = 'trade.missing_price';
    throw missingPrice;
  }
}

function bindOptionPlace(input) {
  if (!readTicketOptionPlace(input)) return input;
  return Object.assign({}, input, {
    type: 'option',
    strike: readStrike(input),
    expiry: readExpiry(input),
    price: readPrice(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'replace')) delete body.replace;
  if (Object.prototype.hasOwnProperty.call(body, 'cancel')) delete body.cancel;
  if (Object.prototype.hasOwnProperty.call(body, 'exercise')) delete body.exercise;
  if (Object.prototype.hasOwnProperty.call(body, 'assign')) delete body.assign;
  if (Object.prototype.hasOwnProperty.call(body, 'cover')) delete body.cover;
  if (Object.prototype.hasOwnProperty.call(body, 'expire')) delete body.expire;
  return body;
}

function optionPlaceBody(bound) {
  var body = {
    type: 'option',
    strike: bound.strike == null ? null : String(bound.strike),
    expiry: bound.expiry == null ? null : String(bound.expiry),
    price: bound.price == null ? null : String(bound.price)
  };
  if (bound.symbol) body.symbol = bound.symbol;
  if (bound.side) body.side = typeof trade.toWireSide === 'function' ? trade.toWireSide(bound.side) : bound.side;
  if (bound.amount !== undefined && bound.amount !== null) body.amount = String(bound.amount);
  else if (bound.qty !== undefined && bound.qty !== null) body.amount = String(bound.qty);
  if (bound.timeInForce) body.timeInForce = String(bound.timeInForce);
  if (bound.postOnly === true) body.postOnly = true;
  if (bound.reduceOnly === true) body.reduceOnly = true;
  if (bound.clientOrderId) body.clientOrderId = String(bound.clientOrderId);
  return stripMark(body);
}

function toPlaceOrderBody(input) {
  if (!readTicketOptionPlace(input)) {
    if (typeof trade.toCreateOrderBody === 'function') return trade.toCreateOrderBody(input);
    return {};
  }
  var bound = bindOptionPlace(input);
  assertTicketOptionPlace(bound);
  return optionPlaceBody(bound);
}

if (trade) {
  var origCreate = typeof trade.toCreateOrderBody === 'function' ? trade.toCreateOrderBody : null;
  if (origCreate) {
    trade.toCreateOrderBody = function (input) {
      if (!readTicketOptionPlace(input)) return origCreate(input);
      var bound = bindOptionPlace(input);
      assertTicketOptionPlace(bound);
      return optionPlaceBody(bound);
    };
  }
  trade.toPlaceOrderBody = toPlaceOrderBody;
  trade.readTicketOptionPlace = readTicketOptionPlace;
  trade.assertTicketOptionPlace = assertTicketOptionPlace;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : action === 'amend' || action === 'replace' ? 'The rest was not amended.' : 'No order was placed.';
    if (reason === 'missing_strike' || reason === 'trade.missing_strike') {
      return 'an option requires a strike; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_expiry' || reason === 'trade.missing_expiry') {
      return 'an option requires an expiry; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_price' || reason === 'trade.missing_price') {
      return 'an option rests as a limit; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionPlaceField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-place')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-place-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-place');
  boxLabel.textContent = 'Rest option';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-place';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Rest option through trade');
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
  addText('ix-ticket-option-place-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-place-expiry', 'Expiry', 'Option expiry');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Rests as a limit through trade. Trade does not invent a mark.';
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
  if (!vm || vm.__optionPlaceWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionPlace({
          type: this.type,
          expire: this.expire === true,
          cover: this.cover === true,
          exercise: this.exercise === true,
          assign: this.assign === true,
          cancel: this.cancel === true,
          replace: this.replace === true,
          amendQty: this.amendQty === true,
          amend: this.amend === true,
          strike: this.strike,
          expiry: this.expiry,
          price: this.price
        });
      } catch (e) {
        return e && e.message ? e.message : 'option place refused';
      }
      return '';
    };
  }
  vm.__optionPlaceWrapped = true;
}

function installBazaarOptionPlaceTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionPlaceField(select);
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
    if (installBazaarOptionPlaceTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionPlaceTicket: installBazaarOptionPlaceTicket,
  readTicketOptionPlace: readTicketOptionPlace,
  assertTicketOptionPlace: assertTicketOptionPlace,
  toPlaceOrderBody: toPlaceOrderBody,
  leftoverStatus: leftoverStatus
};
