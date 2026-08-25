/**
 * Parent residual.remaining is the hard qty cap for children.
 *
 * The leftover must already be a ledger amount. Missing remaining refuses —
 * this never invents a cap from duration, slicesPlanned, or a book.
 */
import { compare, formatAmount, parseAmount, sub, ZERO, type Amount } from '@intafaced/ledger-client';
import type { ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type ParentRemainingCapOk = { readonly ok: true; readonly nextRemaining: string };

export type ParentRemainingCapRefuse =
  | { readonly ok: false; readonly reason: 'missing_residual'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'exceeds_remaining'; readonly detail: string };

function refuse(reason: ParentRemainingCapRefuse['reason'], detail: string): ParentRemainingCapRefuse {
  return { ok: false, reason, detail };
}

export function retainedRemaining(parent: ApprovedAlgoParent): string | null {
  const residual = parent.residual;
  if (residual == null) return null;
  if (residual.released === true) return null;
  const raw = residual.remaining;
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export function capAgainstParentRemaining(
  parent: ApprovedAlgoParent,
  childQty: Amount,
  label: string,
): ParentRemainingCapOk | ParentRemainingCapRefuse {
  const remainingRaw = retainedRemaining(parent);
  if (!remainingRaw) {
    return refuse('missing_residual', 'residual.remaining is missing — refusing to invent leftover from duration or slicesPlanned');
  }
  let remainingAmt;
  try {
    remainingAmt = parseAmount(remainingRaw);
  } catch {
    return refuse('missing_residual', 'residual.remaining is not a ledger amount — refusing to invent leftover');
  }
  if (remainingAmt < ZERO) {
    return refuse('missing_residual', 'residual.remaining is not a ledger amount — refusing to invent leftover');
  }
  if (compare(childQty, remainingAmt) > 0) {
    return refuse('exceeds_remaining', `${label} ${formatAmount(childQty)} exceeds residual.remaining ${formatAmount(remainingAmt)}`);
  }
  return { ok: true, nextRemaining: formatAmount(sub(remainingAmt, childQty)) };
}

export function parentRemainingWriterWired(parentStore: ApprovedAlgoParentStore): ParentRemainingCapRefuse | { readonly ok: true } {
  if (typeof parentStore.consumeResidual !== 'function') {
    return refuse('missing_residual', 'residual.remaining is missing — refusing to invent leftover from duration or slicesPlanned');
  }
  return { ok: true };
}

export function consumeCappedRemaining(
  parentStore: ApprovedAlgoParentStore,
  parentClientOrderId: string,
  nextRemaining: string,
): ParentRemainingCapRefuse | { readonly ok: true; readonly remaining: string } {
  const wired = parentRemainingWriterWired(parentStore);
  if (!wired.ok) return wired;
  const consumed = parentStore.consumeResidual!(parentClientOrderId, nextRemaining);
  if (!consumed) {
    return refuse('missing_residual', 'residual.remaining is missing — refusing to invent leftover from duration or slicesPlanned');
  }
  return { ok: true, remaining: nextRemaining };
}
