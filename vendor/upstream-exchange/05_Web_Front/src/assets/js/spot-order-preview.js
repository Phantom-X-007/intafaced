'use strict';

/*
 * Spot ticket preview — server-authored hold/fee/refusal only.
 * Never invents a fee or hold. Unknown transport is not a preview.
 */
var DECIMAL = /^\d+(\.\d+)?$/;
var SIDES = { BUY: 'buy', SELL: 'sell', buy: 'buy', sell: 'sell' };
var TYPES = {
  LIMIT_PRICE: 'limit',
  MARKET_PRICE: 'market',
  limit: 'limit',
  market: 'market',
  stop: 'stop',
  stop_limit: 'stop_limit',
  take_profit: 'take_profit',
  STOP: 'stop',
  STOP_LIMIT: 'stop_limit',
  TAKE_PROFIT: 'take_profit'
};
var TIFS = { GTC: 'GTC', IOC: 'IOC', FOK: 'FOK', PO: 'PO', GTD: 'GTD', GTT: 'GTT' };
var MONEY_FIELDS = ['amount', 'price', 'stopPrice', 'holdAmount', 'protectionPrice', 'estimatedFee'];
var NULLABLE_MONEY = {
  price: true,
  holdAmount: true,
  protectionPrice: true,
  estimatedFee: true
};
var REFUSAL_FIELDS = ['symbol', 'type', 'side', 'amount', 'price', 'holdAmount', 'fee', 'protectionPrice'];

function decimalString(value) {
  return typeof value === 'string' && DECIMAL.test(value);
}

function positiveDecimal(value) {
  return decimalString(value) && !/^0+(\.0+)?$/.test(value);
}

function toRequest(input) {
  var value = input || {};
  if (typeof value.symbol !== 'string' || !value.symbol.trim()) return { ok: false, reason: 'symbol' };
  var side = SIDES[value.side];
  if (!side) return { ok: false, reason: 'side' };
  var type = TYPES[value.type];
  if (!type) return { ok: false, reason: 'type' };
  if (!positiveDecimal(value.amount)) return { ok: false, reason: 'amount' };
  if (value.reduceOnly === true) return { ok: false, reason: 'reduceOnly' };
  var tif = value.timeInForce == null || value.timeInForce === '' ? 'GTC' : TIFS[value.timeInForce];
  if (!tif) return { ok: false, reason: 'timeInForce' };

  var body = {
    symbol: value.symbol.trim(),
    side: side,
    type: type,
    amount: value.amount,
    timeInForce: tif
  };

  if (type === 'limit' || type === 'stop_limit') {
    if (!positiveDecimal(value.price)) return { ok: false, reason: 'price' };
    body.price = value.price;
  } else if (value.price !== undefined && value.price !== null && String(value.price).trim() !== '') {
    return { ok: false, reason: 'price' };
  }

  if (type === 'stop' || type === 'stop_limit' || type === 'take_profit') {
    if (!positiveDecimal(value.stopPrice)) return { ok: false, reason: 'stopPrice' };
    body.stopPrice = value.stopPrice;
  }

  if (value.postOnly === true) body.postOnly = true;
  if (tif === 'GTD' || tif === 'GTT') {
    var expireAt = typeof value.expireAt === 'string' ? value.expireAt.trim() : '';
    if (!expireAt) return { ok: false, reason: 'expireAt' };
    body.expireAt = expireAt;
  }
  return { ok: true, body: body };
}

function acceptMoney(field, value) {
  if (value === null) return !!NULLABLE_MONEY[field];
  return decimalString(value);
}

function acceptResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'shape' };
  if (typeof value.symbol !== 'string' || !value.symbol) return { ok: false, reason: 'symbol' };
  if (value.side !== 'buy' && value.side !== 'sell') return { ok: false, reason: 'side' };
  if (typeof value.type !== 'string' || !value.type) return { ok: false, reason: 'type' };
  if (!positiveDecimal(value.amount)) return { ok: false, reason: 'amount' };
  if (value.timeInForce !== 'GTC' && value.timeInForce !== 'IOC' && value.timeInForce !== 'FOK' && value.timeInForce !== 'PO' && value.timeInForce !== 'GTD' && value.timeInForce !== 'GTT') {
    return { ok: false, reason: 'timeInForce' };
  }
  for (var i = 0; i < MONEY_FIELDS.length; i += 1) {
    var field = MONEY_FIELDS[i];
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    if (!acceptMoney(field, value[field])) return { ok: false, reason: field };
  }
  if (value.holdAsset !== null && (typeof value.holdAsset !== 'string' || !value.holdAsset)) {
    return { ok: false, reason: 'holdAsset' };
  }
  if (value.feeAsset !== null && (typeof value.feeAsset !== 'string' || !value.feeAsset)) {
    return { ok: false, reason: 'feeAsset' };
  }
  if (value.feeBps !== null && !(typeof value.feeBps === 'number' && value.feeBps === Math.floor(value.feeBps) && value.feeBps >= 0 && value.feeBps < 10000)) {
    return { ok: false, reason: 'feeBps' };
  }
  if (value.feeRole !== null && value.feeRole !== 'maker' && value.feeRole !== 'taker') {
    return { ok: false, reason: 'feeRole' };
  }
  if (typeof value.orderable !== 'boolean' || !Array.isArray(value.refusals)) return { ok: false, reason: 'decision' };
  for (var j = 0; j < value.refusals.length; j += 1) {
    var refusal = value.refusals[j];
    if (!refusal || typeof refusal.code !== 'string' || !refusal.code ||
        REFUSAL_FIELDS.indexOf(refusal.field) === -1 || typeof refusal.message !== 'string' || !refusal.message) {
      return { ok: false, reason: 'refusals' };
    }
  }
  if (value.orderable && value.refusals.length) return { ok: false, reason: 'decision' };
  if (value.orderable) {
    if (!decimalString(value.holdAmount) || typeof value.holdAsset !== 'string' || !value.holdAsset) {
      return { ok: false, reason: 'hold' };
    }
  }
  if ((value.holdAmount === null) !== (value.holdAsset === null)) return { ok: false, reason: 'hold' };
  return { ok: true, data: value };
}

module.exports = { toRequest: toRequest, acceptResponse: acceptResponse };
