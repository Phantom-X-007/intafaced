'use strict';

/*
 * One small, transport-independent vocabulary for the desk's command truth.
 * An unreachable write is never a refusal: the command may have reached the
 * service, so the only safe next step is reconciliation with the order reads.
 */
var UNKNOWN_REASON = {
  submit: 'SUBMIT_UNKNOWN',
  cancel: 'CANCEL_UNKNOWN',
  cancel_all: 'CANCEL_ALL_OUTCOME_UNKNOWN'
};

var CANCEL_ALL_UNKNOWN = 'CANCEL_ALL_OUTCOME_UNKNOWN';
var CANCEL_ALL_PARTIAL = 'CANCEL_ALL_PARTIAL';

function unknown(action, reason, key, message) {
  var reasonCode = reason || UNKNOWN_REASON[action] || 'RECONCILIATION_REQUIRED';
  var state = reasonCode === 'CANCEL_UNKNOWN'
    ? 'CANCEL_UNKNOWN'
    : reasonCode === CANCEL_ALL_UNKNOWN
      ? CANCEL_ALL_UNKNOWN
    : (reasonCode === 'SUBMIT_UNKNOWN' || reasonCode === 'REPLACEMENT_SUBMIT_UNKNOWN')
      ? 'SUBMIT_UNKNOWN'
      : 'RECONCILING';
  return {
    kind: 'unknown',
    outcome: 'OUTCOME_UNKNOWN',
    state: state,
    reasonCode: reasonCode,
    reconciliationKey: key || null,
    message: message || null
  };
}

/**
 * Classify the explicit POST /orders/:id/replace saga response. A 200 is not
 * automatically success: the service can honestly return a terminal refusal
 * or a phase-specific reconciliation outcome.
 */
function classifyReplace(result) {
  if (!result || result.reason === 'unreachable' || result.status === 0) {
    /* The transport cannot prove which saga phase ran. The original may still
       be live, or it may be cancelled with a replacement already submitted. */
    return unknown('amend', 'REPLACE_OUTCOME_UNKNOWN', null, result && result.message ? String(result.message) : null);
  }
  var data = result.data;
  if (!result.ok || !data || typeof data !== 'object') {
    return refused(data || result, 'amend');
  }
  var code = data.code || data.reasonCode || null;
  if (code === 'CANCEL_UNKNOWN') {
    return unknown('cancel', 'CANCEL_UNKNOWN', data.originalOrderId || null, null);
  }
  if (code === 'REPLACEMENT_SUBMIT_UNKNOWN' || code === 'SUBMIT_UNKNOWN') {
    return unknown('submit', 'SUBMIT_UNKNOWN', data.replacementOrderId || null, null);
  }
  if (code === 'RECONCILIATION_REQUIRED' || data.reconciliationRequired === true) {
    return unknown('submit', code || 'RECONCILIATION_REQUIRED', data.replacementOrderId || data.originalOrderId || null, null);
  }
  if (data.accepted === true && (code === 'REPLACED' || code === 'IDEMPOTENT_RETRY')) {
    return applied(data);
  }
  if (data.accepted === false || code) {
    return refused({ reason: code || 'REPLACE_REFUSED', message: data.message || null }, 'amend');
  }
  return unknown('amend', 'REPLACE_OUTCOME_UNKNOWN', null, 'The replacement response was not a trusted saga outcome.');
}

function amendPriority(data) {
  var value = data && data.priority;
  return value === 'retained' || value === 'lost' ? value : null;
}

/**
 * Classify PATCH /orders/:id native amend. Queue place is whatever the
 * service reported — never inferred from HTTP 200 or from AMENDED alone.
 */
function classifyAmend(result) {
  if (!result || result.reason === 'unreachable' || result.status === 0) {
    return unknown('amend', 'AMEND_OUTCOME_UNKNOWN', null, result && result.message ? String(result.message) : null);
  }
  var data = result.data;
  if (!result.ok || !data || typeof data !== 'object') {
    return refused(data || result, 'amend');
  }
  var code = data.code || data.reasonCode || null;
  if (code === 'AMEND_UNKNOWN' || data.reconciliationRequired === true) {
    return unknown(
      'amend',
      'AMEND_UNKNOWN',
      data.orderId || (data.order && data.order.id) || null,
      data.message ? String(data.message) : null
    );
  }
  if (data.accepted === true && (code === 'AMENDED' || code === 'IDEMPOTENT_RETRY')) {
    var out = applied(data);
    out.path = 'NATIVE_AMEND';
    out.priority = amendPriority(data);
    return out;
  }
  if (data.accepted === false || code) {
    return refused({ reason: code || 'AMEND_REFUSED', message: data.message || null }, 'amend');
  }
  return unknown('amend', 'AMEND_OUTCOME_UNKNOWN', null, 'The amend response was not a trusted native outcome.');
}

function applied(data) {
  return {
    kind: 'applied',
    outcome: 'APPLIED',
    state: 'APPLIED',
    reasonCode: null,
    reconciliationKey: null,
    data: data || null
  };
}

function refused(result, action) {
  return {
    kind: 'refused',
    outcome: 'REFUSED',
    state: 'REFUSED',
    reasonCode: (result && result.reason) || (action === 'cancel_all' ? 'CANCEL_ALL_REFUSED' : (action === 'cancel' ? 'CANCEL_REFUSED' : 'SUBMIT_REFUSED')),
    reconciliationKey: null,
    message: result && result.message ? String(result.message) : null
  };
}

function isDefiniteCancelAllRefusal(result) {
  if (!result) return false;
  /* These are request-wide gates. The service is not invoked, so unlike a
     generic HTTP/service failure they cannot hide a sequential prefix. */
  return result.status === 401 || result.status === 403 ||
    result.reason === 'unauthorized' || result.reason === 'forbidden' ||
    result.reason === 'scope_denied' || result.reason === 'tier_required';
}

/**
 * Classify pair mass-cancel POST /markets/:marketId/orders/mass-cancel and the
 * older DELETE /orders[?symbol=] sequential door.
 *
 * Pair matching mass-cancel answers `{ accepted, cancellations, rejected }`.
 * `accepted: false` is a definite refuse (matching was not invoked). A 200
 * array is the sequential door. Transport or non-auth service failure may have
 * already pulled rests, so those stay unknown/partial for read reconciliation.
 */
function classifyCancelAll(result) {
  if (result && result.ok) {
    var data = result.data;
    if (Array.isArray(data)) return applied(data);
    if (data && typeof data === 'object') {
      if (data.accepted === false) {
        var rejected = data.rejected && typeof data.rejected === 'object' ? data.rejected : {};
        return refused(
          {
            reason: rejected.code || 'CANCEL_ALL_REFUSED',
            message: rejected.message || null
          },
          'cancel_all'
        );
      }
      if (data.accepted === true && Array.isArray(data.cancellations)) {
        return applied(data.cancellations);
      }
    }
    return unknown('cancel_all', CANCEL_ALL_UNKNOWN, null, 'The cancel-all response was not a trusted order list.');
  }
  if (isDefiniteCancelAllRefusal(result)) return refused(result, 'cancel_all');
  return {
    kind: 'unknown',
    outcome: 'OUTCOME_UNKNOWN',
    state: CANCEL_ALL_UNKNOWN,
    reasonCode: CANCEL_ALL_PARTIAL,
    reconciliationKey: null,
    message: result && result.message ? String(result.message) : null
  };
}

function fromEvidence(data, action) {
  if (!data || typeof data !== 'object') return null;
  var execution = data.executionOutcome;
  var reason = data.recoveryReason || (execution && execution.reasonCode);
  if (!reason && (!execution || execution.outcome !== 'OUTCOME_UNKNOWN')) return null;
  return unknown(
    action,
    reason,
    data.reconciliationKey || (execution && execution.reconciliationKey),
    null
  );
}

/** Classify a submit/cancel response without looking at HTTP status alone. */
function classify(result, action) {
  if (action === 'cancel_all') return classifyCancelAll(result);
  var evidence = fromEvidence(result && result.data, action);
  if (evidence) return evidence;
  if (result && result.ok) return applied(result.data);
  /* A rejected fetch has no proof that the command did not arrive. */
  if (!result || result.reason === 'unreachable' || result.status === 0) {
    return unknown(action, null, null, result && result.message ? String(result.message) : null);
  }
  return refused(result, action);
}

/** Classify a row found by the safe open/history reconciliation reads. */
function classifyRow(row) {
  if (!row || typeof row !== 'object') return null;
  var evidence = fromEvidence(row, 'submit');
  if (evidence) return evidence;
  return {
    kind: 'resolved',
    outcome: 'APPLIED',
    state: 'RESOLVED',
    reasonCode: null,
    reconciliationKey: null,
    status: row.status || null
  };
}

function transition(state, event) {
  var current = state || { phase: 'idle', clientOrderId: null };
  var type = event && event.type;
  if (type === 'submit_requested') {
    return { phase: 'submitting', clientOrderId: event.clientOrderId };
  }
  if (type === 'cancel_requested') {
    return { phase: 'cancelling', orderId: event.orderId, clientOrderId: event.clientOrderId || null };
  }
  if (type === 'command_result') {
    var verdict = classify(event.result, event.action);
    if (verdict.kind === 'unknown') {
      return Object.assign({}, current, { phase: 'unknown', verdict: verdict });
    }
    return Object.assign({}, current, { phase: verdict.kind === 'applied' ? 'applied' : 'refused', verdict: verdict });
  }
  if (type === 'reconcile_requested') {
    return Object.assign({}, current, { phase: 'reconciling' });
  }
  if (type === 'reconciliation_row') {
    var rowVerdict = classifyRow(event.row);
    if (!rowVerdict) return Object.assign({}, current, { phase: 'unknown' });
    if (rowVerdict.kind === 'unknown') return Object.assign({}, current, { phase: 'unknown', verdict: rowVerdict });
    return Object.assign({}, current, { phase: 'resolved', verdict: rowVerdict });
  }
  return current;
}

module.exports = {
  UNKNOWN_REASON: UNKNOWN_REASON,
  CANCEL_ALL_UNKNOWN: CANCEL_ALL_UNKNOWN,
  CANCEL_ALL_PARTIAL: CANCEL_ALL_PARTIAL,
  classify: classify,
  classifyCancelAll: classifyCancelAll,
  classifyReplace: classifyReplace,
  classifyAmend: classifyAmend,
  classifyRow: classifyRow,
  transition: transition
};
