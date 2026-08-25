/**
 * Bazaar ticket auction / benchmark through the trade place that landed in #3326.
 * Unsupported intent refuses rather than becoming a silent limit.
 * Missing or false is a normal order. Ticket does not invent an auction price.
 */
'use strict';

var trade = require('./ix-trade.js');

function readBox(input, key, id) {
  if (input && input[key] === true) return true;
  if (typeof document !== 'undefined') {
    var el = document.getElementById(id);
    if (el && el.checked === true) return true;
  }
  return false;
}

function readTicketAuction(input) {
  return readBox(input, 'auction', 'ix-ticket-auction');
}

function readTicketBenchmark(input) {
  return readBox(input, 'benchmark', 'ix-ticket-benchmark');
}

function refuse(code, message) {
  var err = new Error(message);
  err.code = code;
  throw err;
}

function assertTicketAuction(input) {
  if (readTicketAuction(input)) {
    refuse('trade.auction_unsupported', 'auction orders are unsupported; trade does not invent an auction price');
  }
  if (readTicketBenchmark(input)) {
    refuse('trade.benchmark_unsupported', 'benchmark orders are unsupported; trade does not invent a benchmark price');
  }
}

function bindAuction(input) {
  if (!input) return input;
  var next = input;
  if (readTicketAuction(input)) next = Object.assign({}, next, { auction: true });
  if (readTicketBenchmark(input)) next = Object.assign({}, next, { benchmark: true });
  return next;
}

if (trade && typeof trade.toCreateOrderBody === 'function') {
  var origCreate = trade.toCreateOrderBody;
  trade.toCreateOrderBody = function (input) {
    var bound = bindAuction(input);
    assertTicketAuction(bound);
    return origCreate(bound);
  };
  trade.readTicketAuction = readTicketAuction;
  trade.assertTicketAuction = assertTicketAuction;
}

if (trade && typeof trade.orderFailureMessage === 'function') {
  var origFail = trade.orderFailureMessage;
  trade.orderFailureMessage = function (result, action) {
    var reason = result && result.reason;
    var verb = action === 'cancel' ? 'The order was not cancelled.' : 'No order was placed.';
    if (reason === 'auction_unsupported' || reason === 'trade.auction_unsupported') {
      return 'auction orders are unsupported; trade does not invent an auction price. ' + verb;
    }
    if (reason === 'benchmark_unsupported' || reason === 'trade.benchmark_unsupported') {
      return 'benchmark orders are unsupported; trade does not invent a benchmark price. ' + verb;
    }
    return origFail(result, action);
  };
}

function addBox(field, id, labelText) {
  var label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = labelText;
  var inputWrap = document.createElement('div');
  inputWrap.className = 'ix-input';
  var input = document.createElement('input');
  input.id = id;
  input.type = 'checkbox';
  input.setAttribute('aria-label', labelText);
  inputWrap.appendChild(input);
  field.appendChild(label);
  field.appendChild(inputWrap);
}

function ensureAuctionField(select) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ix-ticket-auction')) return;
  if (!select || !select.parentNode) return;
  var field = document.createElement('div');
  field.className = 'ix-field';
  field.id = 'ix-ticket-auction-wrap';
  addBox(field, 'ix-ticket-auction', 'Auction');
  addBox(field, 'ix-ticket-benchmark', 'Benchmark');
  var note = document.createElement('p');
  note.className = 'ix-order-note';
  note.textContent = 'Unsupported auction and benchmark refuse. Trade does not invent an auction price. Unchecked is a normal order.';
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
  if (!vm || vm.__auctionWrapped) return;
  var origValidate = vm.validateOrderFields;
  if (typeof origValidate === 'function') {
    vm.validateOrderFields = function () {
      var first = origValidate.apply(this, arguments);
      if (first) return first;
      try {
        assertTicketAuction({
          auction: this.auction === true,
          benchmark: this.benchmark === true
        });
      } catch (e) {
        return e && e.message ? e.message : 'auction refused';
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
        if (e && (e.code === 'trade.auction_unsupported' || e.code === 'trade.benchmark_unsupported')) {
          this.submitting = false;
          if (typeof this.focusOrderError === 'function') this.focusOrderError(e.message);
          else if (typeof this.warn === 'function') this.warn(e.message);
          return;
        }
        throw e;
      }
    };
  }
  vm.__auctionWrapped = true;
}

function installBazaarAuctionTicket(doc) {
  var root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.getElementById !== 'function') return false;
  var select = root.getElementById('ix-ticket-tif');
  if (!select) return false;
  if (root === document) {
    ensureAuctionField(select);
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
    if (installBazaarAuctionTicket(document) || tries > 40) clearInterval(timer);
  }, 250);
}

start();

module.exports = {
  installBazaarAuctionTicket: installBazaarAuctionTicket,
  readTicketAuction: readTicketAuction,
  readTicketBenchmark: readTicketBenchmark,
  assertTicketAuction: assertTicketAuction
};
