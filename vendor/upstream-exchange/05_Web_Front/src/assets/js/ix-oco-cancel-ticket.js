/**
 * Bazaar ticket: cancel both siblings of a linked OCO through trade.
 * Refuse if either sibling is already terminal. Ticket does not invent a trigger.
 * Not a redo of #3650 (trade cancel) or #3638 (bazaar place).
 */
'use strict';

var trade = require('./ix-trade.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function readTicketOcoCancel(input) {
  if (input && input.replace === true) return false;
  if (input && input.amendQty === true) return false;
  if (input && input.amend === true && input.cancel !== true) return false;
  if (input && input.exercise === true) return false;
  if (input && input.assign === true) return false;
  if (input && input.cover === true) return false;
  if (input && input.expire === true) return false;
  if (input && input.take === true) return false;
  if (input && input.type === 'option') return false;
  if (input && input.cancel === true && input.oco === true) return true;
  if (typeof document !== 'undefined') {
    var box = document.getElementById('ix-ticket-oco-cancel');
    if (box && box.checked === true) return true;
  }
  return false;
}

function readOrderId(input) {
  if (input && input.orderId !== undefined && input.orderId !== null) {
    var fromOrder = String(input.orderId).trim();
    if (fromOrder) return fromOrder;
  }
  if (input && input.id !== undefined && input.id !== null) {
    var fromId = String(input.id).trim();
    if (fromId) return fromId;
  }
  var typed = readField('ix-ticket-oco-cancel-id');
  return typed ? typed : null;
}

function assertTicketOcoCancel(input) {
  if (!readTicketOcoCancel(input)) return;
  if (!readOrderId(input)) {
    var missing = new Error('an OCO cancel requires the linked order; trade does not invent a trigger');
    missing.code = 'trade.order_not_found';
    throw missing;
  }
}

function bindOcoCancel(input) {
  if (!readTicketOcoCancel(input)) return input;
  return Object.assign({}, input, {
    cancel: true,
    oco: true,
    orderId: readOrderId(input)
  });
}

function stripTrigger(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'mark')) delete body.mark;
  if (Object.prototype.hasOwnProperty.call(body, 'takeProfit')) delete body.takeProfit;
  if (Object.prototype.hasOwnProperty.call(body, 'stopLoss')) delete body.stopLoss;
  if (Object.prototype.hasOwnProperty.call(body, 'replace')) delete body.replace;
  if (Object.prototype.hasOwnProperty.call(body, 'price')) delete body.price;
  if (Object.prototype.hasOwnProperty.call(body, 'qty')) delete body.qty;
  if (Object.prototype.hasOwnProperty.call(body, 'amount')) delete body.amount;
  return body;
}

function ocoCancelBody(bound) {
  return stripTrigger({
    cancel: true,
    oco: true,
    orderId: bound.orderId == null ? null : String(bound.orderId)
  });
}

var origCreate = null;
var origCancel = null;

function toCancelOrderBody(input) {
  if (!readTicketOcoCancel(input)) {
    if (typeof origCancel === 'function') return origCancel(input);
    var id = input && (input.orderId || input.id);
    return id ? { orderId: String(id) } : {};
  }
  var bound = bindOcoCancel(input);
  assertTicketOcoCancel(bound);
  return ocoCancelBody(bound);
}

if (trade) {
  origCreate = typeof trade.toCreateOrderBody === 'function' ? trade.toCreateOrderBody : null;
  origCancel = typeof trade.toCancelOrderBody === 'function' ? trade.toCancelOrderBody : null;
  if (origCreate) {
    trade.toCreateOrderBody = function (input) {
      if (!readTicketOcoCancel(input)) return origCreate(input);
      var bound = bindOcoCancel(input);
      assertTicketOcoCancel(bound);
      return ocoCancelBody(bound);
    };
  }
  trade.toCancelOrderBody = toCancelOrderBody;
  trade.readTicketOcoCancel = readTicketOcoCancel;
  trade.assertTicketOcoCancel = assertTicketOcoCancel;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'oco_sibling_terminal' || reason === 'trade.oco_sibling_terminal') {
      return 'an OCO sibling is already terminal; trade does not invent a trigger. ' + verb;
    }
    return origFail(result, action);
  };
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

function ensureOcoCancelField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-oco-cancel')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-oco-cancel-wrap';
  var boxLabel = document.createElement('label');
  boxLabel.setAttribute('for', 'ix-ticket-oco-cancel');
  boxLabel.textContent = 'Cancel linked OCO';
  var boxWrap = document.createElement('div');
  boxWrap.className = 'ix-input';
  var box = document.createElement('input');
  box.id = 'ix-ticket-oco-cancel';
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Cancel both siblings of a linked OCO');
  boxWrap.appendChild(box);
  var idLabel = document.createElement('label');
  idLabel.setAttribute('for', 'ix-ticket-oco-cancel-id');
  idLabel.textContent = 'Linked order';
  var idWrap = document.createElement('div');
  idWrap.className = 'ix-input';
  var idInput = document.createElement('input');
  idInput.id = 'ix-ticket-oco-cancel-id';
  idInput.type = 'text';
  idInput.spellcheck = false;
  idInput.setAttribute('autocomplete', 'off');
  idInput.setAttribute('aria-label', 'Linked OCO order id');
  idWrap.appendChild(idInput);
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Cancels both siblings through trade. Refuse if either is already terminal. Trade does not invent a trigger.';
  field.appendChild(boxLabel);
  field.appendChild(boxWrap);
  field.appendChild(idLabel);
  field.appendChild(idWrap);
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
  if (!vm || vm.__ocoCancelWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketOcoCancel({
          cancel: this.cancel === true,
          oco: this.oco === true,
          replace: this.replace === true,
          amendQty: this.amendQty === true,
          amend: this.amend === true,
          exercise: this.exercise === true,
          assign: this.assign === true,
          cover: this.cover === true,
          expire: this.expire === true,
          take: this.take === true,
          type: this.type,
          orderId: this.orderId || this.id
        });
      } catch (e) {
        return e && e.message ? e.message : 'OCO cancel refused';
      }
      return '';
    };
  }
  vm.__ocoCancelWrapped = true;
}

function installBazaarOcoCancelTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureOcoCancelField(select);
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
    if (installBazaarOcoCancelTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarOcoCancelTicket: installBazaarOcoCancelTicket,
  readTicketOcoCancel: readTicketOcoCancel,
  assertTicketOcoCancel: assertTicketOcoCancel,
  toCancelOrderBody: toCancelOrderBody,
  leftoverStatus: leftoverStatus
};
