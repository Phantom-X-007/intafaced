#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var exchange = fs.readFileSync(path.join(root, 'pages/exchange/Exchange.vue'), 'utf8');
var trade = fs.readFileSync(path.join(__dirname, 'ix-trade.js'), 'utf8');

function has(source, needle) {
  if (source.indexOf(needle) === -1) throw new Error('exchange-hlplus-order-ticket.golden missing ' + needle);
}

has(exchange, "setOrderType('stop')");
has(exchange, "setOrderType('stop_limit')");
has(exchange, "setOrderType('trailing_stop')");
has(exchange, 'v-model="timeInForce"');
has(exchange, 'v-model="reduceOnly"');
has(exchange, 'v-model="postOnly"');
has(exchange, 'v-model="form.stopPrice"');
has(exchange, 'clientOrderId: this.pendingClientOrderId');
has(exchange, '@change="clearOrderSubmissionIdentity"');
has(exchange, 'clearPendingOrderIdentity()');
has(exchange, 'clearPendingAdvancedIdentity()');
has(exchange, '{{ orderTypeLabel(row) }}');
has(trade, 'body.stopPrice = String(input.stopPrice)');
has(trade, 'body.timeInForce = String(input.timeInForce)');
has(trade, 'if (input.reduceOnly === true) body.reduceOnly = true');
if (/Number\s*\(\s*input\.(price|stopPrice|amount)/.test(trade)) {
  throw new Error('exchange-hlplus-order-ticket.golden money must stay decimal strings');
}

console.log('exchange-hlplus-order-ticket.golden: ok');
