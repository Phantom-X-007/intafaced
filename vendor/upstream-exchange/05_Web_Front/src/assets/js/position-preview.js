'use strict';

var DECIMAL = /^\d+(\.\d+)?$/;
var MONEY_FIELDS = ['markPrice', 'leverageCap', 'orderValue', 'initialMargin', 'estimatedFee', 'liquidationPrice'];
var REFUSAL_FIELDS = ['symbol', 'markPrice', 'leverage', 'fee', 'liquidationPrice'];

function positiveDecimal(value) {
  return typeof value === 'string' && DECIMAL.test(value) && !/^0+(\.0+)?$/.test(value);
}

function toRequest(input) {
  var value = input || {};
  if (typeof value.symbol !== 'string' || !value.symbol.trim()) return { ok: false, reason: 'symbol' };
  if (value.side !== 'BUY' && value.side !== 'SELL') return { ok: false, reason: 'side' };
  if (!positiveDecimal(value.size)) return { ok: false, reason: 'size' };
  if (!positiveDecimal(value.leverage)) return { ok: false, reason: 'leverage' };
  return {
    ok: true,
    body: {
      symbol: value.symbol.trim(),
      side: value.side === 'BUY' ? 'long' : 'short',
      size: value.size,
      leverage: value.leverage,
      marginMode: 'isolated',
    },
  };
}

function acceptResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'shape' };
  if (typeof value.symbol !== 'string' || !value.symbol) return { ok: false, reason: 'symbol' };
  if (value.side !== 'long' && value.side !== 'short') return { ok: false, reason: 'side' };
  if (!positiveDecimal(value.size) || !positiveDecimal(value.leverage)) return { ok: false, reason: 'input' };
  if (value.marginMode !== 'isolated') return { ok: false, reason: 'marginMode' };
  if (value.markSource !== null && value.markSource !== 'depth' && value.markSource !== 'venue') {
    return { ok: false, reason: 'markSource' };
  }
  for (var i = 0; i < MONEY_FIELDS.length; i += 1) {
    var field = MONEY_FIELDS[i];
    var validMoney = field === 'estimatedFee'
      ? typeof value[field] === 'string' && DECIMAL.test(value[field])
      : positiveDecimal(value[field]);
    if (value[field] !== null && !validMoney) return { ok: false, reason: field };
  }
  if ((value.markPrice === null) !== (value.markSource === null)) return { ok: false, reason: 'markSource' };
  if (typeof value.orderable !== 'boolean' || !Array.isArray(value.refusals)) return { ok: false, reason: 'decision' };
  for (var j = 0; j < value.refusals.length; j += 1) {
    var refusal = value.refusals[j];
    if (!refusal || typeof refusal.code !== 'string' || !refusal.code ||
        REFUSAL_FIELDS.indexOf(refusal.field) === -1 || typeof refusal.message !== 'string' || !refusal.message) {
      return { ok: false, reason: 'refusals' };
    }
  }
  if (value.orderable && value.refusals.length) return { ok: false, reason: 'decision' };
  if (value.orderable && MONEY_FIELDS.some(function (field) { return value[field] === null; })) {
    return { ok: false, reason: 'decision' };
  }
  return { ok: true, data: value };
}

module.exports = { toRequest: toRequest, acceptResponse: acceptResponse };
