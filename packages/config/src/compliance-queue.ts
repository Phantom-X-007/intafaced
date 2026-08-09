/**
 * COMPLIANCE QUEUE MECHANISM — empty-safe, partner-honest (TRK-ops.compliance Stage 2).
 *
 * Operators process screening hits / review cases. This file is the pure
 * disposition model only — no DB, no UI, no partner invent, no sanctions list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * A queue that can mark a case `partner_cleared` without a screening partner
 * wired is a green tick factory. Same class of lie as empty sanctions looking
 * like a clean bill of health: the mechanism exists, the authority does not.
 *
 * Rules:
 *   · Empty queue is honest empty — never invent pending cases.
 *   · `partner_cleared` is refused when partnerConfigured is false.
 *   · Operator clear/reject always allowed (human authority).
 *   · Unknown disposition codes refuse closed.
 *
 * Full case-management product (UI, persistence, SLA) remains residual.
 * Sanctions list *content* remains Class X.
 */

/** What fed the queue item — mechanism kinds only, not list content. */
export type ComplianceQueueKind = 'screening_hit' | 'kyc_review' | 'network_flag' | 'manual';

export type ComplianceQueueItem = {
  readonly id: string;
  readonly kind: ComplianceQueueKind;
  /** Opaque subject — identity id, account id. Not PII payload. */
  readonly subjectId: string;
  readonly openedAt: string;
};

export type ComplianceQueueDispositionRequest =
  | { readonly status: 'pending' }
  | { readonly status: 'cleared'; readonly by: 'operator'; readonly actor: string }
  | { readonly status: 'rejected'; readonly by: 'operator'; readonly actor: string; readonly reason: string }
  /** Only valid when a screening partner is configured. */
  | { readonly status: 'partner_cleared'; readonly partnerRef: string };

export type ComplianceQueueDispositionResult =
  | {
      readonly ok: true;
      readonly status: 'pending' | 'cleared' | 'rejected' | 'partner_cleared';
      readonly itemId: string;
      readonly actor: string;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'refuse.partner_absent'
        | 'refuse.unknown_item'
        | 'refuse.empty_actor'
        | 'refuse.empty_reason'
        | 'refuse.empty_partner_ref';
      readonly reason: string;
    };

export type ComplianceQueueSnapshot = {
  readonly items: readonly ComplianceQueueItem[];
  readonly partnerConfigured: boolean;
  /** Honest empty — true when length === 0; never invent fillers. */
  readonly empty: boolean;
  readonly summary: string;
};

/**
 * Snapshot a queue. Empty is a first-class state, not a prompt to invent rows.
 */
export function complianceQueueSnapshot(
  items: readonly ComplianceQueueItem[],
  partnerConfigured: boolean,
): ComplianceQueueSnapshot {
  const empty = items.length === 0;
  const summary = empty
    ? partnerConfigured
      ? 'compliance queue: EMPTY — partner configured, nothing pending.'
      : 'compliance queue: EMPTY — no partner configured; partner_cleared dispositions will refuse.'
    : `compliance queue: ${items.length} pending; partner=${partnerConfigured ? 'configured' : 'absent'}.`;

  return { items, partnerConfigured, empty, summary };
}

/**
 * Apply a disposition. Pure function — storage is the caller's job.
 *
 * Hostile path this blocks: `partner_cleared` while partnerConfigured=false.
 */
export function applyComplianceQueueDisposition(
  item: ComplianceQueueItem | null | undefined,
  request: ComplianceQueueDispositionRequest,
  partnerConfigured: boolean,
): ComplianceQueueDispositionResult {
  if (!item) {
    return {
      ok: false,
      code: 'refuse.unknown_item',
      reason: 'compliance queue: item not found — cannot invent a case to clear.',
    };
  }

  switch (request.status) {
    case 'pending':
      return { ok: true, status: 'pending', itemId: item.id, actor: 'system' };

    case 'cleared': {
      const actor = request.actor?.trim() ?? '';
      if (actor === '') {
        return {
          ok: false,
          code: 'refuse.empty_actor',
          reason: 'compliance queue: operator clear requires a named actor.',
        };
      }
      return { ok: true, status: 'cleared', itemId: item.id, actor };
    }

    case 'rejected': {
      const actor = request.actor?.trim() ?? '';
      const reason = request.reason?.trim() ?? '';
      if (actor === '') {
        return {
          ok: false,
          code: 'refuse.empty_actor',
          reason: 'compliance queue: operator reject requires a named actor.',
        };
      }
      if (reason === '') {
        return {
          ok: false,
          code: 'refuse.empty_reason',
          reason: 'compliance queue: operator reject requires a reason.',
        };
      }
      return { ok: true, status: 'rejected', itemId: item.id, actor };
    }

    case 'partner_cleared': {
      if (!partnerConfigured) {
        return {
          ok: false,
          code: 'refuse.partner_absent',
          reason:
            'compliance queue: refuse partner_cleared — no screening partner is configured. ' +
            'Do not invent a partner pass. Operator clear is the honest path without a partner.',
        };
      }
      const partnerRef = request.partnerRef?.trim() ?? '';
      if (partnerRef === '') {
        return {
          ok: false,
          code: 'refuse.empty_partner_ref',
          reason: 'compliance queue: partner_cleared requires a partnerRef audit token (not a vendor brand).',
        };
      }
      return { ok: true, status: 'partner_cleared', itemId: item.id, actor: `partner:${partnerRef}` };
    }

    default: {
      // Exhaustiveness — hostile free-form status.
      const _never: never = request;
      return {
        ok: false,
        code: 'refuse.unknown_item',
        reason: `compliance queue: unknown disposition ${JSON.stringify(_never)}`,
      };
    }
  }
}

/**
 * Filter pending items by kind. Empty filter → empty result (not invent all).
 */
export function filterComplianceQueue(
  items: readonly ComplianceQueueItem[],
  kinds: readonly ComplianceQueueKind[],
): readonly ComplianceQueueItem[] {
  if (kinds.length === 0) return [];
  const set = new Set(kinds);
  return items.filter((i) => set.has(i.kind));
}
