'use strict';

/*
 * Bazaar batch entry is a client-side staging seam, not a second order book.
 * The server remains the only money path. This module only keeps immutable
 * drafts and classifies the one sequential batch response.
 */
var MAX_BATCH_ORDERS = 100;

function supportedSpotBody(body) {
  return !!(body && (body.type === 'market' || body.type === 'limit') &&
    typeof body.symbol === 'string' && body.symbol &&
    (body.side === 'buy' || body.side === 'sell') &&
    typeof body.amount === 'string' && body.amount &&
    (body.type === 'market' || (typeof body.price === 'string' && body.price)) &&
    typeof body.clientOrderId === 'string' && body.clientOrderId);
}

function fingerprint(body) {
  if (!body || typeof body !== 'object') return '';
  return JSON.stringify({
    symbol: body.symbol,
    type: body.type,
    side: body.side,
    amount: body.amount,
    price: body.price === undefined ? null : body.price,
    timeInForce: body.timeInForce === undefined ? null : body.timeInForce,
    postOnly: body.postOnly === true,
    reduceOnly: body.reduceOnly === true
  });
}

function createDraft(body) {
  return {
    clientOrderId: body && body.clientOrderId ? String(body.clientOrderId) : '',
    body: body,
    fingerprint: fingerprint(body),
    status: 'staged',
    result: null
  };
}

function validateDrafts(drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { ok: false, reason: 'empty', message: 'Stage at least one spot order first.' };
  }
  if (drafts.length > MAX_BATCH_ORDERS) {
    return { ok: false, reason: 'cap', message: 'A batch can contain at most ' + MAX_BATCH_ORDERS + ' orders.' };
  }
  var seen = Object.create(null);
  for (var i = 0; i < drafts.length; i += 1) {
    var body = drafts[i] && drafts[i].body ? drafts[i].body : drafts[i];
    var id = body && typeof body.clientOrderId === 'string' ? body.clientOrderId : '';
    if (!supportedSpotBody(body)) {
      return { ok: false, reason: 'unsupported', index: i, message: 'Only supported spot market and limit orders can enter a batch.' };
    }
    if (seen[id]) {
      return { ok: false, reason: 'duplicate_id', clientOrderId: id, index: i, message: 'Duplicate client order ID refused locally: ' + id };
    }
    seen[id] = true;
  }
  return { ok: true };
}

function buildPayload(drafts) {
  var check = validateDrafts(drafts);
  if (!check.ok) return check;
  return {
    ok: true,
    payload: {
      /* Preserve the staged array order; svc-trade executes sequentially. */
      orders: drafts.map(function (draft) { return draft.body || draft; })
    }
  };
}

function allUnknown(drafts, message, reason) {
  return {
    kind: 'unknown',
    requestOutcome: 'unknown',
    reason: reason || 'batch_outcome_unknown',
    message: message || 'Batch outcome is unknown; reconcile each client order ID before retrying.',
    items: drafts.map(function (draft, index) {
      var body = draft.body || draft;
      return { index: index, clientOrderId: body.clientOrderId, status: 'unknown', body: body, result: null };
    })
  };
}

function requestRefused(drafts, result) {
  var message = result && result.message ? String(result.message) : 'The batch request was refused; no batch item was accepted.';
  return {
    kind: 'refused',
    requestOutcome: 'refused',
    reason: result && result.status === 401 ? 'unauthorized' : 'forbidden',
    message: message,
    items: drafts.map(function (draft, index) {
      var body = draft.body || draft;
      return { index: index, clientOrderId: body.clientOrderId, status: 'refused', body: body, result: null };
    })
  };
}

function isRequestWideAuthRefusal(result) {
  return !!(result && (result.status === 401 || result.status === 403 ||
    result.reason === 'unauthorized' || result.reason === 'forbidden' ||
    result.reason === 'scope_denied' || result.reason === 'tier_required'));
}

function classifyResponse(result, drafts) {
  var check = validateDrafts(drafts);
  if (!check.ok) return check;
  if (isRequestWideAuthRefusal(result)) return requestRefused(drafts, result);
  /* A timeout, network failure, 5xx, or malformed body may have crossed the
     write boundary. Keep every ID durable and prohibit blind retry. */
  if (!result || result.reason === 'unreachable' || result.reason === 'timeout' ||
    result.status === 0 || result.status === 408 || result.status >= 500) {
    return allUnknown(drafts, result && result.message, 'batch_transport_unknown');
  }
  if (!result.ok) {
    return requestRefused(drafts, result);
  }
  var rows = result.data && Array.isArray(result.data.results) ? result.data.results : null;
  if (!rows || rows.length !== drafts.length) {
    return allUnknown(drafts, 'The batch response was malformed; reconcile each client order ID before retrying.', 'batch_response_malformed');
  }
  var expected = Object.create(null);
  drafts.forEach(function (draft, index) {
    var body = draft.body || draft;
    expected[body.clientOrderId] = { index: index, body: body };
  });
  var seen = Object.create(null);
  var items = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var id = row && typeof row.clientOrderId === 'string' ? row.clientOrderId : '';
    var match = expected[id];
    /* Never infer correspondence from array position alone. */
    if (!match || seen[id]) return allUnknown(drafts, 'The batch response did not correspond to staged client order IDs; reconcile before retrying.', 'batch_response_malformed');
    seen[id] = true;
    var status = row.status === 'success' || row.status === 'accepted' ? 'accepted' :
      row.status === 'refused' ? 'refused' : row.status === 'unknown' ? 'unknown' : null;
    if (!status) return allUnknown(drafts, 'The batch response contained an unknown item status; reconcile before retrying.', 'batch_response_malformed');
    if (status === 'accepted' && (!row.order || row.order.clientOrderId !== id)) {
      return allUnknown(drafts, 'The batch response accepted an item without matching order evidence; reconcile before retrying.', 'batch_response_malformed');
    }
    items.push({ index: match.index, clientOrderId: id, status: status, body: match.body, result: row });
  }
  items.sort(function (a, b) { return a.index - b.index; });
  return {
    kind: 'mixed',
    requestOutcome: 'applied',
    message: null,
    items: items
  };
}

module.exports = {
  MAX_BATCH_ORDERS: MAX_BATCH_ORDERS,
  createDraft: createDraft,
  fingerprint: fingerprint,
  validateDrafts: validateDrafts,
  buildPayload: buildPayload,
  classifyResponse: classifyResponse
};
