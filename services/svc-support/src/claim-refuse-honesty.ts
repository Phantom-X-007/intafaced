/**
 * Support L3 — pure claim refuse-reason catalog honesty (no ticket I/O).
 *
 * Mirrors operator-queue.ts ClaimRefuse reasons.
 * Does not invent steal / reassign product law.
 */

export const CLAIM_REFUSE_REASONS = ['not_found', 'not_queueable', 'already_claimed', 'invalid_operator'] as const;
export type ClaimRefuseReasonId = (typeof CLAIM_REFUSE_REASONS)[number];

export type ClaimDecisionBoardInput = { readonly status: 'ok' } | { readonly status: 'refuse'; readonly reason: ClaimRefuseReasonId };

/** L3 — catalog board. */
export function claimRefuseCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasNotFound: number;
  readonly hasNotQueueable: number;
  readonly hasAlreadyClaimed: number;
  readonly hasInvalidOperator: number;
} {
  return {
    reasons: CLAIM_REFUSE_REASONS.length,
    hasNotFound: CLAIM_REFUSE_REASONS.includes('not_found') ? 1 : 0,
    hasNotQueueable: CLAIM_REFUSE_REASONS.includes('not_queueable') ? 1 : 0,
    hasAlreadyClaimed: CLAIM_REFUSE_REASONS.includes('already_claimed') ? 1 : 0,
    hasInvalidOperator: CLAIM_REFUSE_REASONS.includes('invalid_operator') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function claimRefuseCatalogStatusLine(): string {
  const c = claimRefuseCatalogBoardCard();
  return `reasons=${c.reasons} not_found=${c.hasNotFound} not_queueable=${c.hasNotQueueable} already_claimed=${c.hasAlreadyClaimed} invalid_operator=${c.hasInvalidOperator}`;
}

/** L3 — parse catalog. */
export function parseClaimRefuseCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly notFound: number;
  readonly notQueueable: number;
  readonly alreadyClaimed: number;
  readonly invalidOperator: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) not_found=([01]) not_queueable=([01]) already_claimed=([01]) invalid_operator=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    notFound: Number(m[2]),
    notQueueable: Number(m[3]),
    alreadyClaimed: Number(m[4]),
    invalidOperator: Number(m[5]),
  };
}

/** L3 — true when catalog matches. */
export function claimRefuseCatalogStatusLineMatches(): boolean {
  const p = parseClaimRefuseCatalogStatusLine(claimRefuseCatalogStatusLine());
  if (!p) return false;
  const c = claimRefuseCatalogBoardCard();
  return (
    p.reasons === c.reasons &&
    p.notFound === c.hasNotFound &&
    p.notQueueable === c.hasNotQueueable &&
    p.alreadyClaimed === c.hasAlreadyClaimed &&
    p.invalidOperator === c.hasInvalidOperator
  );
}

/** L3 — four refuse reasons. */
export function claimRefuseCatalogStatusLineConsistent(line: string): boolean {
  const p = parseClaimRefuseCatalogStatusLine(line);
  if (!p) return false;
  return p.reasons === 4 && p.notFound === 1 && p.notQueueable === 1 && p.alreadyClaimed === 1 && p.invalidOperator === 1;
}

/** L3 — decision board. */
export function claimDecisionSimpleBoardCard(decision: ClaimDecisionBoardInput): {
  readonly ok: number;
  readonly reason: string;
} {
  if (decision.status === 'ok') return { ok: 1, reason: '-' };
  return { ok: 0, reason: decision.reason };
}

/** L3 — decision status line. */
export function claimDecisionSimpleStatusLine(decision: ClaimDecisionBoardInput): string {
  const c = claimDecisionSimpleBoardCard(decision);
  return `ok=${c.ok} reason=${c.reason}`;
}

/** L3 — parse decision. */
export function parseClaimDecisionSimpleStatusLine(line: string): {
  readonly ok: number;
  readonly reason: string;
} | null {
  const m = line.trim().match(/^ok=([01]) reason=([a-z0-9._-]+)$/);
  if (!m) return null;
  return { ok: Number(m[1]), reason: m[2]! };
}

/** L3 — true when decision matches. */
export function claimDecisionSimpleStatusLineMatches(decision: ClaimDecisionBoardInput): boolean {
  const p = parseClaimDecisionSimpleStatusLine(claimDecisionSimpleStatusLine(decision));
  if (!p) return false;
  const c = claimDecisionSimpleBoardCard(decision);
  return p.ok === c.ok && p.reason === c.reason;
}

/** L3 — ok implies reason dash. */
export function claimDecisionSimpleStatusLineConsistent(line: string): boolean {
  const p = parseClaimDecisionSimpleStatusLine(line);
  if (!p) return false;
  if (p.ok === 1) return p.reason === '-';
  return p.reason !== '-';
}

/** L3 — export header. */
export function claimDecisionSimpleExportHeader(): string {
  return 'ok,reason';
}

/** L3 — export line. */
export function claimDecisionSimpleExportLine(decision: ClaimDecisionBoardInput): string {
  const c = claimDecisionSimpleBoardCard(decision);
  return `${c.ok},${c.reason}`;
}

/** L3 — full export. */
export function claimDecisionSimpleExportText(decision: ClaimDecisionBoardInput): string {
  return [claimDecisionSimpleExportHeader(), claimDecisionSimpleExportLine(decision)].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredClaimRefuseReason(reason: string): boolean {
  return (CLAIM_REFUSE_REASONS as readonly string[]).includes(reason);
}
