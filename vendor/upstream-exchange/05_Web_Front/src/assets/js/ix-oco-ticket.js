/**
 * Bazaar ticket: place a linked OCO with take-profit and stop-loss through trade.
 * Refuse if either sibling is missing. Ticket does not invent a trigger.
 * Not a redo of #3634 (trade place) or #3247 (old two-leg rest wire).
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

function readTicketOcoPlace(input) {
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
  if (input && input.oco === true) return true;
  if (input && (input.takeProfit !== undefined || input.stopLoss !== undefined)) return true;
  if (readField('ix-ticket-tp-stop') || readField('ix-ticket-sl-stop')) return true;
  return false;
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function readTakeProfit(input) {
  return readTrigger(input, 'takeProfit', 'ix-ticket-tp-stop');
}

function readStopLoss(input) {
  return readTrigger(input, 'stopLoss', 'ix-ticket-sl-stop');
}

function assertTicketOco(input) {
  if (!readTicketOcoPlace(input)) return;
  if (!positiveMoney(readTakeProfit(input))) {
    var missingTp = new Error('an OCO take-profit is missing; trade does not invent a trigger');
    missingTp.code = 'trade.missing_oco_trigger';
    throw missingTp;
  }
  if (!positiveMoney(readStopLoss(input))) {
    var missingSl = new Error('an OCO stop-loss is missing; trade does not invent a trigger');
    missingSl.code = 'trade.missing_oco_trigger';
    throw missingSl;
  }
}

function bindOco(input) {
  if (!readTicketOcoPlace(input)) return input;
  return Object.assign({}, input, {
    oco: true,
    takeProfit: readTakeProfit(input),
    stopLoss: readStopLoss(input)
  });
}

function stripMark(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  return body;
}

function ocoPlaceBody(bound, origCreate) {
  var stripped = Object.assign({}, bound);
  delete stripped.takeProfit;
  delete stripped.stopLoss;
  delete stripped.oco;
  delete stripped.mark;
  var body = typeof origCreate === 'function' ? origCreate(stripped) : {};
  body.oco = true;
  body.takeProfit = bound.takeProfit == null ? null : String(bound.takeProfit);
  body.stopLoss = bound.stopLoss == null ? null : String(bound.stopLoss);
  return stripMark(body);
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    if (!readTicketOcoPlace(input)) return origCreate(input);
    var bound = bindOco(input);
    assertTicketOco(bound);
    return ocoPlaceBody(bound, origCreate);
  };
  trade.readTicketOco = function (input) {
    return {
      takeProfit: readTakeProfit(input),
      stopLoss: readStopLoss(input)
    };
  };
  trade.assertTicketOco = assertTicketOco;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'missing_oco_trigger' || reason === 'trade.missing_oco_trigger' || reason === 'missing_stop_price') {
      return 'an OCO take-profit and stop-loss are both required; trade does not invent a trigger. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOcoFields(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-tp-stop')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-oco-wrap';
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Linked OCO place through trade. Both take-profit and stop-loss required. Trade does not invent a trigger.';
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
  addStop('ix-ticket-tp-stop', 'Take profit', 'OCO take-profit');
  addStop('ix-ticket-sl-stop', 'Stop loss', 'OCO stop-loss');
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
  if (!vm || vm.__ocoWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOco({
          oco: this.oco === true,
          takeProfit: this.takeProfit,
          stopLoss: this.stopLoss,
          take: this.take === true,
          expire: this.expire === true,
          cover: this.cover === true,
          exercise: this.exercise === true,
          assign: this.assign === true,
          cancel: this.cancel === true,
          replace: this.replace === true,
          type: this.type
        });
      } catch (e) {
        return e && e.message ? e.message : 'OCO place refused';
      }
      return '';
    };
  }
  vm.__ocoWrapped = true;
}

function installBazaarOcoTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOcoFields(select);
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
    if (installBazaarOcoTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOcoTicket: installBazaarOcoTicket,
  readTicketOcoPlace: readTicketOcoPlace,
  assertTicketOco: assertTicketOco,
  leftoverStatus: leftoverStatus
};
require('./ix-close-ticket.js');
require('./ix-post-only-ticket.js');
require('./ix-ioc-ticket.js');
require('./ix-fok-ticket.js');
require('./ix-iceberg-ticket.js');
require('./ix-stop-limit-ticket.js');
require('./ix-trailing-stop-ticket.js');
require('./ix-min-qty-ticket.js');
require('./ix-aon-ticket.js');
require('./ix-peg-ticket.js');
require('./ix-auction-ticket.js');
require('./ix-self-trade-ticket.js');
require('./ix-oco-cancel-ticket.js');
