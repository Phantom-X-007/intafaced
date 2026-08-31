/**
 * Bazaar ticket: take an option against a resting option through trade.
 * Same strike and expiry. Refuse if strike or expiry is missing.
 * Ticket does not invent a mark. Not a redo of #3619 (place) or #3484 (matching take).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketOptionTake(input) {
  if (input && input.replace === true) return false;
  if (input && input.amendQty === true) return false;
  if (input && input.amend === true && input.take !== true) return false;
  if (input && input.cancel === true) return false;
  if (input && input.exercise === true) return false;
  if (input && input.assign === true) return false;
  if (input && input.cover === true) return false;
  if (input && input.expire === true) return false;
  if (input && input.take === true) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-take');
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
  return readDecimal(input, 'strike', 'ix-ticket-option-take-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-take-expiry');
  return typed ? typed : null;
}

function readPrice(input) {
  return readDecimal(input, 'price', 'ix-ticket-option-take-price');
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionTake(input) {
  if (!readTicketOptionTake(input)) return;
  if (!positiveMoney(readStrike(input))) {
    var missingStrike = new Error('an option take requires a strike; trade does not invent a mark');
    missingStrike.code = 'trade.missing_strike';
    throw missingStrike;
  }
  var expiry = readExpiry(input);
  if (expiry == null || expiry.length === 0) {
    var missingExpiry = new Error('an option take requires an expiry; trade does not invent a mark');
    missingExpiry.code = 'trade.missing_expiry';
    throw missingExpiry;
  }
  if (!positiveMoney(readPrice(input))) {
    var missingPrice = new Error('an option take requires a price; trade does not invent a mark');
    missingPrice.code = 'trade.missing_price';
    throw missingPrice;
  }
}

function bindOptionTake(input) {
  if (!readTicketOptionTake(input)) return input;
  return Object.assign({}, input, {
    take: true,
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

function optionTakeBody(bound) {
  var body = stripMark({
    take: true,
    type: 'option',
    strike: bound.strike == null ? null : String(bound.strike),
    expiry: bound.expiry == null ? null : String(bound.expiry),
    price: bound.price == null ? null : String(bound.price)
  });
  if (bound.symbol) body.symbol = bound.symbol;
  if (bound.side) body.side = typeof trade.toWireSide === 'function' ? trade.toWireSide(bound.side) : bound.side;
  if (bound.amount !== undefined && bound.amount !== null) body.amount = String(bound.amount);
  else if (bound.qty !== undefined && bound.qty !== null) body.amount = String(bound.qty);
  return body;
}

function toTakeOrderBody(input) {
  if (!readTicketOptionTake(input)) {
    if (typeof trade.toCreateOrderBody === 'function') return trade.toCreateOrderBody(input);
    return {};
  }
  var bound = bindOptionTake(input);
  assertTicketOptionTake(bound);
  return optionTakeBody(bound);
}

if (trade) {
  var origCreate = typeof trade.toCreateOrderBody === 'function' ? trade.toCreateOrderBody : null;
  if (origCreate) {
    trade.toCreateOrderBody = function (input) {
      if (!readTicketOptionTake(input)) return origCreate(input);
      var bound = bindOptionTake(input);
      assertTicketOptionTake(bound);
      return optionTakeBody(bound);
    };
  }
  trade.toTakeOrderBody = toTakeOrderBody;
  trade.readTicketOptionTake = readTicketOptionTake;
  trade.assertTicketOptionTake = assertTicketOptionTake;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : action === 'amend' || action === 'replace' ? 'The rest was not amended.' : 'No order was placed.';
    if (reason === 'missing_strike' || reason === 'trade.missing_strike') {
      return 'an option take requires a strike; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_expiry' || reason === 'trade.missing_expiry') {
      return 'an option take requires an expiry; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_price' || reason === 'trade.missing_price') {
      return 'an option take requires a price; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionTakeField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-take')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-take-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-take');
  boxLabel.textContent = 'Take option';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-take';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Take option against a resting option');
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
  addText('ix-ticket-option-take-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-take-expiry', 'Expiry', 'Option expiry');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Takes a resting option with the same strike and expiry through trade. Trade does not invent a mark.';
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueTake(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__optionTakeWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionTake({
          take: this.take === true,
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
        return e && e.message ? e.message : 'option take refused';
      }
      return '';
    };
  }
  vm.__optionTakeWrapped = true;
}

function installBazaarOptionTakeTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionTakeField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueTake(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarOptionTakeTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionTakeTicket: installBazaarOptionTakeTicket,
  readTicketOptionTake: readTicketOptionTake,
  assertTicketOptionTake: assertTicketOptionTake,
  toTakeOrderBody: toTakeOrderBody,
  leftoverStatus: leftoverStatus
};
