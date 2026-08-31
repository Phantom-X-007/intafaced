/**
 * Bazaar ticket: cover a short option after assignment through trade.
 * Refuse if strike or expiry is missing. Ticket does not invent a mark.
 * Not a redo of #3603 (trade assign) or #3513 (trade cover).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketOptionCover(input) {
  if (input && input.replace === true) return false;
  if (input && input.amendQty === true) return false;
  if (input && input.amend === true && input.cover !== true) return false;
  if (input && input.cancel === true) return false;
  if (input && input.exercise === true) return false;
  if (input && input.assign === true) return false;
  if (input && input.cover === true) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-option-cover');
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
  return readDecimal(input, 'strike', 'ix-ticket-option-cover-strike');
}

function readExpiry(input) {
  if (input && input.expiry !== undefined && input.expiry !== null) {
    var fromInput = String(input.expiry).trim();
    return fromInput ? fromInput : null;
  }
  var typed = readField('ix-ticket-option-cover-expiry');
  return typed ? typed : null;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketOptionCover(input) {
  if (!readTicketOptionCover(input)) return;
  if (!positiveMoney(readStrike(input))) {
    var missingStrike = new Error('an option cover requires a strike; trade does not invent a mark');
    missingStrike.code = 'trade.missing_strike';
    throw missingStrike;
  }
  var expiry = readExpiry(input);
  if (expiry == null || expiry.length === 0) {
    var missingExpiry = new Error('an option cover requires an expiry; trade does not invent a mark');
    missingExpiry.code = 'trade.missing_expiry';
    throw missingExpiry;
  }
}

function bindOptionCover(input) {
  if (!readTicketOptionCover(input)) return input;
  return Object.assign({}, input, {
    cover: true,
    strike: readStrike(input),
    expiry: readExpiry(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'replace')) delete body.replace;
  if (Object.prototype.hasOwnProperty.call(body, 'cancel')) delete body.cancel;
  if (Object.prototype.hasOwnProperty.call(body, 'exercise')) delete body.exercise;
  if (Object.prototype.hasOwnProperty.call(body, 'assign')) delete body.assign;
  if (Object.prototype.hasOwnProperty.call(body, 'price')) delete body.price;
  if (Object.prototype.hasOwnProperty.call(body, 'qty')) delete body.qty;
  return body;
}

function optionCoverBody(bound) {
  return stripMark({
    cover: true,
    strike: bound.strike == null ? null : String(bound.strike),
    expiry: bound.expiry == null ? null : String(bound.expiry)
  });
}

function toCoverOrderBody(input) {
  if (!readTicketOptionCover(input)) {
    if (typeof trade.toCreateOrderBody === 'function') return trade.toCreateOrderBody(input);
    return {};
  }
  var bound = bindOptionCover(input);
  assertTicketOptionCover(bound);
  return optionCoverBody(bound);
}

if (trade) {
  var origCreate = typeof trade.toCreateOrderBody === 'function' ? trade.toCreateOrderBody : null;
  if (origCreate) {
    trade.toCreateOrderBody = function (input) {
      if (!readTicketOptionCover(input)) return origCreate(input);
      var bound = bindOptionCover(input);
      assertTicketOptionCover(bound);
      return optionCoverBody(bound);
    };
  }
  trade.toCoverOrderBody = toCoverOrderBody;
  trade.readTicketOptionCover = readTicketOptionCover;
  trade.assertTicketOptionCover = assertTicketOptionCover;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : action === 'amend' || action === 'replace' ? 'The rest was not amended.' : 'No order was placed.';
    if (reason === 'missing_strike' || reason === 'trade.missing_strike') {
      return 'an option cover requires a strike; trade does not invent a mark. ' + verb;
    }
    if (reason === 'missing_expiry' || reason === 'trade.missing_expiry') {
      return 'an option cover requires an expiry; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOptionCoverField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-option-cover')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-option-cover-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-option-cover');
  boxLabel.textContent = 'Cover short option';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-option-cover';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Cover short option after assignment');
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
  addText('ix-ticket-option-cover-strike', 'Strike', 'Option strike');
  addText('ix-ticket-option-cover-expiry', 'Expiry', 'Option expiry');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Covers a short after assignment through trade. Trade does not invent a mark.';
  field.appendChild(note);
  select.parentNode.appendChild(field);
}

function wrapVueCover(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__optionCoverWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOptionCover({
          cover: this.cover === true,
          exercise: this.exercise === true,
          assign: this.assign === true,
          cancel: this.cancel === true,
          replace: this.replace === true,
          amendQty: this.amendQty === true,
          amend: this.amend === true,
          strike: this.strike,
          expiry: this.expiry
        });
      } catch (e) {
        return e && e.message ? e.message : 'option cover refused';
      }
      return '';
    };
  }
  vm.__optionCoverWrapped = true;
}

function installBazaarOptionCoverTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOptionCoverField(select);
    var ticket = root.getElementById('ix-ticket');
    wrapVueCover(ticket || select);
  }
  return true;
}

function start() {
  if (typeof document === 'undefined') return;
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installBazaarOptionCoverTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOptionCoverTicket: installBazaarOptionCoverTicket,
  readTicketOptionCover: readTicketOptionCover,
  assertTicketOptionCover: assertTicketOptionCover,
  toCoverOrderBody: toCoverOrderBody,
  leftoverStatus: leftoverStatus
};
