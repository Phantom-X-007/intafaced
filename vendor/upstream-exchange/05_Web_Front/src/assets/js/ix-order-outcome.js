'use strict';

/*
 * One small, transport-independent vocabulary for the desk's command truth.
 * An unreachable write is never a refusal: the command may have reached the
 * service, so the only safe next step is reconciliation with the order reads.
 */
var UNKNOWN_REASON = {
  submit: 'SUBMIT_UNKNOWN',
  cancel: 'CANCEL_UNKNOWN'
};

function unknown(action, reason, key, message) {
  var reasonCode = reason || UNKNOWN_REASON[action] || 'RECONCILIATION_REQUIRED';
  var state = reasonCode === 'CANCEL_UNKNOWN' ? 'CANCEL_UNKNOWN' : reasonCode === 'SUBMIT_UNKNOWN' ? 'SUBMIT_UNKNOWN' : 'RECONCILING';
  return {
    kind: 'unknown',
    outcome: 'OUTCOME_UNKNOWN',
    state: state,
    reasonCode: reasonCode,
    reconciliationKey: key || null,
    message: message || null
  };
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
    reasonCode: (result && result.reason) || (action === 'cancel' ? 'CANCEL_REFUSED' : 'SUBMIT_REFUSED'),
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
  classify: classify,
  classifyRow: classifyRow,
  transition: transition
};
