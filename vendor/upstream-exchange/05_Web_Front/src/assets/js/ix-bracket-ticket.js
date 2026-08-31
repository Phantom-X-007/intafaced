/**
 * Bazaar ticket: place a linked bracket with entry, take-profit, and stop-loss through trade.
 * Refuse if any leg is missing. Ticket does not invent a trigger.
 * Not a redo of #3666 (trade place) or #3638 (OCO place).
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function triggerOf(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint') {
    var direct = String(raw).trim();
    return direct ? direct : null;
  }
  if (typeof raw !== 'object') return null;
  var stop = typeof raw.stopPrice === 'string' ? raw.stopPrice.trim() : '';
  if (stop) return stop;
  var price = typeof raw.price === 'string' ? raw.price.trim() : '';
  return price ? price : null;
}

function readTrigger(input, key, fieldId) {
  if (input && Object.prototype.hasOwnProperty.call(input, key)) {
    return triggerOf(input[key]);
  }
  var typed = readField(fieldId);
  return typed ? typed : null;
}

function readTicketBracketPlace(input) {
  if (input && input.replace === true) return false;
  if (input && input.amendQty === true) return false;
  if (input && input.amend === true) return false;
  if (input && input.cancel === true) return false;
  if (input && input.exercise === true) return false;
  if (input && input.assign === true) return false;
  if (input && input.cover === true) return false;
  if (input && input.expire === true) return false;
  if (input && input.take === true) return false;
  if (input && input.type === 'option') return false;
  if (input && input.oco === true) return false;
  if (input && input.bracket === true) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-bracket');
    if (box && box.checked === true) return true;
  }
  return false;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function readTakeProfit(input) {
  return readTrigger(input, 'takeProfit', 'ix-ticket-bracket-tp');
}

function readStopLoss(input) {
  return readTrigger(input, 'stopLoss', 'ix-ticket-bracket-sl');
}

function readEntry(input) {
  var type = input && input.type ? String(input.type).toLowerCase() : '';
  if (type === 'market' || type === 'market_price') return null;
  if (input && Object.prototype.hasOwnProperty.call(input, 'price')) {
    return triggerOf(input.price);
  }
  var typed = readField('ix-ticket-price');
  return typed ? typed : null;
}

function assertTicketBracket(input) {
  if (!readTicketBracketPlace(input)) return;
  var type = input && input.type ? String(input.type).toLowerCase() : '';
  if (type !== 'market' && type !== 'market_price' && !positiveMoney(readEntry(input))) {
    var missingEntry = new Error('a bracket entry is missing; trade does not invent a trigger');
    missingEntry.code = 'trade.missing_price';
    throw missingEntry;
  }
  if (!positiveMoney(readTakeProfit(input))) {
    var missingTp = new Error('a bracket take-profit is missing; trade does not invent a trigger');
    missingTp.code = 'trade.missing_stop_price';
    throw missingTp;
  }
  if (!positiveMoney(readStopLoss(input))) {
    var missingSl = new Error('a bracket stop-loss is missing; trade does not invent a trigger');
    missingSl.code = 'trade.missing_stop_price';
    throw missingSl;
  }
}

function bindBracket(input) {
  if (!readTicketBracketPlace(input)) return input;
  return Object.assign({}, input, {
    bracket: true,
    takeProfit: readTakeProfit(input),
    stopLoss: readStopLoss(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'oco')) delete body.oco;
  return body;
}

function bracketPlaceBody(bound, origCreate) {
  var stripped = Object.assign({}, bound);
  delete stripped.takeProfit;
  delete stripped.stopLoss;
  delete stripped.bracket;
  delete stripped.oco;
  delete stripped.mark;
  var body = typeof origCreate === 'function' ? origCreate(stripped) : {};
  body.bracket = true;
  body.takeProfit = bound.takeProfit == null ? null : String(bound.takeProfit);
  body.stopLoss = bound.stopLoss == null ? null : String(bound.stopLoss);
  return stripMark(body);
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    if (!readTicketBracketPlace(input)) return origCreate(input);
    var bound = bindBracket(input);
    assertTicketBracket(bound);
    return bracketPlaceBody(bound, origCreate);
  };
  trade.readTicketBracket = function (input) {
    return {
      takeProfit: readTakeProfit(input),
      stopLoss: readStopLoss(input)
    };
  };
  trade.assertTicketBracket = assertTicketBracket;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'trade.missing_stop_price') {
      return 'a bracket take-profit and stop-loss are both required; trade does not invent a trigger. ' + verb;
    }
    if (reason === 'trade.missing_price') {
      return 'a bracket entry is missing; trade does not invent a trigger. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureBracketFields(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-bracket')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-bracket-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-bracket');
  boxLabel.textContent = 'Linked bracket';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-bracket';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Place a linked bracket with entry, take-profit, and stop-loss');
  boxWrap.appendChild(box);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Linked bracket place through trade. Entry, take-profit, and stop-loss required. Trade does not invent a trigger.';
  function addStop(id, labelText, aria) {
    var label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    var inputWrap = document.createElement('div');
    inputWrap.className = 'ix-input';
    var input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.spellcheck = false;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', aria);
    inputWrap.appendChild(input);
    field.appendChild(label);
    field.appendChild(inputWrap);
  }
  field.appendChild(boxLabel);
  field.appendChild(boxWrap);
  addStop('ix-ticket-bracket-tp', 'Take profit', 'bracket take-profit');
  addStop('ix-ticket-bracket-sl', 'Stop loss', 'bracket stop-loss');
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
  if (!vm || vm.__bracketWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketBracket({
          bracket: this.bracket === true,
          oco: this.oco === true,
          takeProfit: this.takeProfit,
          stopLoss: this.stopLoss,
          price: this.price,
          type: this.type,
          take: this.take === true,
          expire: this.expire === true,
          cover: this.cover === true,
          exercise: this.exercise === true,
          assign: this.assign === true,
          cancel: this.cancel === true,
          replace: this.replace === true
        });
      } catch (e) {
        return e && e.message ? e.message : 'bracket place refused';
      }
      return '';
    };
  }
  vm.__bracketWrapped = true;
}

function installBazaarBracketTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureBracketFields(select);
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
    if (installBazaarBracketTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarBracketTicket: installBazaarBracketTicket,
  readTicketBracketPlace: readTicketBracketPlace,
  assertTicketBracket: assertTicketBracket,
  leftoverStatus: leftoverStatus
};
