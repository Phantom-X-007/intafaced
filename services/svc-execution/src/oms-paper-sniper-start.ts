/**
 * Start one already-approved paper sniper parent.
 * Paper off refuses. Trigger price is the retained leftover from paper approve —
 * blank refuses. Never invents a live venue or a trigger. Does not place children
 * and does not touch matching.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { PaperGate } from './oms-paper.js';

export type OmsPaperSniperStartRefuseReason =
  | 'missing_parent'
  | 'not_approved'
  | 'already_started'
  | 'missing_trigger'
  | 'not_live'
  | 'paper_gate_unwired'
  | 'paper_off'
  | 'missing_operator';

export type OmsPaperSniperStartRefusal = {
  readonly ok: false;
  readonly reason: OmsPaperSniperStartRefuseReason;
  readonly detail: string;
};

export type OmsPaperSniperStartOk = {
  readonly ok: true;
  readonly started: true;
  readonly paper: true;
  readonly parentClientOrderId: string;
  readonly kind: 'sniper';
  readonly status: 'paper';
  readonly triggerPrice: string;
};

export type OmsPaperSniperStartResult =
  | OmsPaperSniperStartOk
  | OmsPaperSniperStartRefusal;

function refuse(
  reason: OmsPaperSniperStartRefuseReason,
  detail: string,
): OmsPaperSniperStartRefusal {
  return { ok: false, reason, detail };
}

function parseRetainedTriggerPrice(
  raw: string | null | undefined,
): { ok: true; text: string } | OmsPaperSniperStartRefusal {
  if (raw === null || raw === undefined) {
    return refuse(
      'missing_trigger',
      'sniper trigger price is missing — refusing to invent a trigger or a live venue',
    );
  }
  const text = raw.trim();
  if (text.length === 0) {
    return refuse(
      'missing_trigger',
      'sniper trigger price is missing — refusing to invent a trigger or a live venue',
    );
  }
  try {
    return { ok: true, text: formatAmount(parseAmount(text)) };
  } catch {
    return refuse(
      'missing_trigger',
      'sniper trigger price is not a ledger amount — refusing to invent a trigger',
    );
  }
}

/**
 * Start an already-approved paper sniper parent.
 * Paper off refuses — no live venue is invented.
 */
export function startPaperSniperParent(input: {
  parentClientOrderId?: string;
  kind?: string;
  /** Must be true — start needs an already-approved paper sniper parent. */
  approved?: boolean;
  /** Paper-approved status is 'paper'. Live running refuses already_started. */
  status?: 'paper' | 'approved' | 'running' | string;
  /** Retained trigger price from paper approve. Blank refuses — never invent a trigger. */
  triggerPrice?: string | null;
  operatorId?: string;
  paper?: PaperGate;
}): OmsPaperSniperStartResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.paper) {
    return refuse('paper_gate_unwired', 'paper gate is required for paper sniper start');
  }
  if (input.paper.enabled === false) {
    return refuse('paper_off', 'paper is off — refusing to invent a live venue or a live child');
  }
  if (input.kind !== undefined && input.kind !== 'sniper') {
    return refuse('not_live', `kind ${String(input.kind)} is not sniper`);
  }
  if (input.status === 'running') {
    return refuse(
      'already_started',
      `parent ${parentClientOrderId} is already running live — refusing to invent a paper start over live`,
    );
  }
  if (input.approved !== true && input.status !== 'paper' && input.status !== 'approved') {
    return refuse(
      'not_approved',
      `parent ${parentClientOrderId} is not an approved paper sniper parent`,
    );
  }
  const operatorId = input.operatorId?.trim() ?? '';
  if (!operatorId) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  const trigger = parseRetainedTriggerPrice(input.triggerPrice);
  if (!trigger.ok) return trigger;

  return {
    ok: true,
    started: true,
    paper: true,
    parentClientOrderId,
    kind: 'sniper',
    status: 'paper',
    triggerPrice: trigger.text,
  };
}
