/**
 * Bazaar ticket trailing stop through the trade place that landed in #3297.
 * The stop walks with the mark.
 * Refuse if trail is missing. Ticket does not invent a distance or a mark.
 */
'use strict';

var trade = require('./ix-trade.js');
var ixMoney = require('./ix-money.js');

function readField(id) {
  if (typeof document === 'undefined') return '';
  var el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function isTrailingType(type) {
  var value = String(type || '').toLowerCase();
  return value === 'trailing_stop';
}

function readTicketTrailing(input) {
  if (input && (isTrailingType(input.type) || input.trail !== undefined)) return true;
  if (typeof document !== 'undefined') {
    if (readField('ix-ticket-trail') || readField('ix-ticket-mark')) return true;
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

function readTrail(input) {
  return readDecimal(input, 'trail', 'ix-ticket-trail');
}

function readMark(input) {
  return readDecimal(input, 'mark', 'ix-ticket-mark');
}

function positiveMoney(raw) {
  if (raw == null) return false;
  if (typeof ixMoney.isPositive !== 'function') return false;
  return ixMoney.isPositive(raw) === true;
}

function assertTicketTrailing(input) {
  if (!readTicketTrailing(input)) return;
  var trail = readTrail(input);
  if (!positiveMoney(trail)) {
    var missingTrail = new Error('a trailing stop requires a trail; trade does not invent a distance');
    missingTrail.code = 'trade.missing_trail';
    throw missingTrail;
  }
  var mark = readMark(input);
  if (!positiveMoney(mark)) {
    var missingMark = new Error('a trailing stop walks with the mark; trade does not invent a mark');
    missingMark.code = 'trade.missing_mark';
    throw missingMark;
  }
}

function bindTrailing(input) {
  if (!readTicketTrailing(input)) return input;
  var nextType = input && isTrailingType(input.type) ? 'LIMIT_PRICE' : input && input.type;
  return Object.assign({}, input, { type: nextType, trail: readTrail(input), mark: readMark(input) });
}

function leftoverStatus(order) {
  if (!order) return null;
  return order.status || null;
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindTrailing(input);
    assertTicketTrailing(bound);
    var body = origCreate(bound);
    if (bound && (bound.trail !== undefined || (input && isTrailingType(input.type)))) {
      body.type = 'limit';
      body.trail = bound.trail == null ? null : String(bound.trail);
      body.mark = bound.mark == null ? null : String(bound.mark);
    }
    return body;
  };
  trade.readTicketTrailing = readTicketTrailing;
  trade.assertTicketTrailing = assertTicketTrailing;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'missing_trail' || reason === 'trade.missing_trail') {
      return 'a trailing stop requires a trail; trade does not invent a distance. ' + verb;
    }
    if (reason === 'missing_mark' || reason === 'trade.missing_mark') {
      return 'a trailing stop walks with the mark; trade does not invent a mark. ' + verb;
    }
    return origFail(result, action);
  };
}

function wrapVuePlace(root) {
  var el = root;
  var vm = null;
  while (el && !vm) {
    vm = el.__vue__ || null;
    el = el.parentElement;
  }
  if (!vm || vm.__trailingStopWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        var form = this.form || {};
        var payload = { type: this.orderType || this.type };
        if (isTrailingType(payload.type)) {
          payload.trail = form.trail != null ? form.trail : this.trail;
          payload.mark = form.mark != null ? form.mark : this.mark;
        }
        assertTicketTrailing(payload);
      } catch (e) {
        return e && e.message ? e.message : 'trailing stop refused';
      }
      return '';
    };
  }
  var origPlace = vm.placeOrder;
  if (typeof origPlace === 'function') {
    vm.placeOrder = function () {
      try {
        return origPlace.apply(this, arguments);
      } catch (e) {
        if (e && (e.code === 'trade.missing_trail' || e.code === 'trade.missing_mark')) {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__trailingStopWrapped = true;
}

function installBazaarTrailingStopTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
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
    if (installBazaarTrailingStopTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarTrailingStopTicket: installBazaarTrailingStopTicket,
  readTicketTrailing: readTicketTrailing,
  assertTicketTrailing: assertTicketTrailing,
  leftoverStatus: leftoverStatus
};
