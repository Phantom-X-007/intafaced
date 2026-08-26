'use strict';

/*
 * Bazaar bulk native amend — client staging for POST /orders/batch-amend.
 *
 * Sequential, non-atomic. Each item is qty-only native amend. Price/side/type
 * never ride this payload (those stay named cancel/replace on the single
 * amend ticket). Per-item APPLIED / REFUSED / OUTCOME_UNKNOWN. Never treat
 * CANCEL_REPLACE as applied.
 *
 * CommonJS for golden tests + webpack require.
 */

var MAX_BATCH_AMENDS = 100;
var STATUSES = { APPLIED: 'APPLIED', REFUSED: 'REFUSED', OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN' };

function positiveDecimal(value) {
  if (typeof value !== 'string' || !value) return false;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return false;
  if (/^0+(?:\.0+)?$/.test(value)) return false;
  return true;
}

function createDraft(input) {
  var src = input || {};
  var orderId = typeof src.orderId === 'string' ? src.orderId.trim() : '';
  var qty = typeof src.qty === 'string' ? src.qty.trim() : '';
  return {
    orderId: orderId,
    qty: qty,
    status: 'staged',
    result: null
  };
}

function validateDrafts(drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return { ok: false, reason: 'empty', message: 'Stage at least one native qty amend first.' };
  }
  if (drafts.length > MAX_BATCH_AMENDS) {
    return { ok: false, reason: 'cap', message: 'A batch amend can contain at most ' + MAX_BATCH_AMENDS + ' items.' };
  }
  var seen = Object.create(null);
  for (var i = 0; i < drafts.length; i += 1) {
    var draft = drafts[i] || {};
    var orderId = typeof draft.orderId === 'string' ? draft.orderId.trim() : '';
    var qty = typeof draft.qty === 'string' ? draft.qty.trim() : '';
    if (!orderId) {
      return { ok: false, reason: 'missing_id', index: i, message: 'Each batch amend needs a non-empty order id.' };
    }
    if (!positiveDecimal(qty)) {
      return { ok: false, reason: 'qty', index: i, orderId: orderId, message: 'Qty must be a positive decimal string.' };
    }
    if (draft.price != null || draft.side != null || draft.type != null || draft.timeInForce != null) {
      return {
        ok: false,
        reason: 'cancel_replace',
        index: i,
        orderId: orderId,
        message: 'Price, side, type, or TIF changes are cancel/replace — not a native batch amend.'
      };
    }
    if (seen[orderId]) {
      return { ok: false, reason: 'duplicate_id', index: i, orderId: orderId, message: 'Duplicate order id refused locally: ' + orderId };
    }
    seen[orderId] = true;
  }
  return { ok: true };
}

function buildPayload(drafts) {
  var check = validateDrafts(drafts);
  if (!check.ok) return check;
  return {
    ok: true,
    payload: {
      amends: drafts.map(function (draft) {
        return { id: draft.orderId, qty: draft.qty };
      })
    }
  };
}

function allUnknown(drafts, message, reason) {
  return {
    kind: 'unknown',
    requestOutcome: 'unknown',
    reason: reason || 'batch_amend_outcome_unknown',
    message: message || 'Batch amend outcome is unknown; reconcile each order id before retrying.',
    items: drafts.map(function (draft, index) {
      return { index: index, orderId: draft.orderId, status: 'unknown', qty: draft.qty, result: null };
    })
  };
}

function requestRefused(drafts, result) {
  var message = result && result.message ? String(result.message) : 'The batch amend request was refused; no item was applied.';
  return {
    kind: 'refused',
    requestOutcome: 'refused',
    reason: result && result.status === 401 ? 'unauthorized' : 'forbidden',
    message: message,
    items: drafts.map(function (draft, index) {
      return { index: index, orderId: draft.orderId, status: 'refused', qty: draft.qty, result: null };
    })
  };
}

function isRequestWideAuthRefusal(result) {
  return !!(result && (result.status === 401 || result.status === 403 ||
    result.reason === 'unauthorized' || result.reason === 'forbidden' ||
    result.reason === 'scope_denied' || result.reason === 'tier_required'));
}

function itemStatus(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.status === STATUSES.APPLIED) {
    if (row.code === 'CANCEL_REPLACE' || row.reasonCode === 'trade.amend_price_change' || row.reasonCode === 'trade.amend_side_change') {
      return 'refused';
    }
    return 'applied';
  }
  if (row.status === STATUSES.REFUSED) return 'refused';
  if (row.status === STATUSES.OUTCOME_UNKNOWN) return 'unknown';
  return null;
}

function classifyResponse(result, drafts) {
  var check = validateDrafts(drafts);
  if (!check.ok) return check;
  if (isRequestWideAuthRefusal(result)) return requestRefused(drafts, result);
  if (!result || result.reason === 'unreachable' || result.reason === 'timeout' ||
    result.status === 0 || result.status === 408 || result.status >= 500) {
    return allUnknown(drafts, result && result.message, 'batch_amend_transport_unknown');
  }
  if (!result.ok) {
    return requestRefused(drafts, result);
  }
  var body = result.data;
  if (body && body.atomic === true) {
    return allUnknown(drafts, 'Batch amend claimed atomicity; reconcile each order id.', 'batch_amend_atomic_claim');
  }
  var rows = body && Array.isArray(body.results) ? body.results : null;
  if (!rows || rows.length !== drafts.length) {
    return allUnknown(drafts, 'The batch amend response was malformed; reconcile each order id before retrying.', 'batch_amend_response_malformed');
  }
  var expected = Object.create(null);
  drafts.forEach(function (draft, index) {
    expected[draft.orderId] = { index: index, qty: draft.qty };
  });
  var seen = Object.create(null);
  var items = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var id = row && typeof row.orderId === 'string' ? row.orderId : '';
    var match = expected[id];
    if (!match || seen[id]) {
      return allUnknown(drafts, 'The batch amend response did not correspond to staged order ids; reconcile before retrying.', 'batch_amend_response_malformed');
    }
    seen[id] = true;
    var status = itemStatus(row);
    if (!status) {
      return allUnknown(drafts, 'The batch amend response contained an unknown item status; reconcile before retrying.', 'batch_amend_response_malformed');
    }
    items.push({ index: match.index, orderId: id, status: status, qty: match.qty, result: row });
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
  MAX_BATCH_AMENDS: MAX_BATCH_AMENDS,
  STATUSES: STATUSES,
  createDraft: createDraft,
  validateDrafts: validateDrafts,
  buildPayload: buildPayload,
  classifyResponse: classifyResponse
};
