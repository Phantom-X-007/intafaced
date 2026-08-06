/**
 * Certifications L3 — pure xpEarned publish shape (no ledger money).
 *
 * Does not call the bus; callers that own EventBus use this payload.
 * Double-award blocked by idempotencyKey from Stage-2 policy.
 */

import type { XpEarnedIntent } from './xp-policy.js';

export type XpEarnedPublishShape = {
  readonly userId: string;
  readonly xpDelta: string;
  readonly idempotencyKey: string;
  readonly source: 'academy.cert';
  readonly certId: string;
};

export function toXpEarnedPublish(intent: XpEarnedIntent): XpEarnedPublishShape {
  return {
    userId: intent.userId,
    xpDelta: intent.xpDelta,
    idempotencyKey: intent.idempotencyKey,
    source: 'academy.cert',
    certId: intent.certId,
  };
}

export function mayPublishXp(intent: XpEarnedIntent | null): intent is XpEarnedIntent {
  if (!intent) return false;
  if (!/^\d+$/.test(intent.xpDelta) || intent.xpDelta === '0') return false;
  if (!intent.idempotencyKey.startsWith('academy.cert:')) return false;
  return true;
}

/** L3 — true when publish shape has positive numeric xp delta string. */
export function publishShapeHasPositiveXp(shape: XpEarnedPublishShape): boolean {
  return /^\d+$/.test(shape.xpDelta) && shape.xpDelta !== '0';
}

/** L3 — export line for publish shape. */
export function xpPublishExportLine(shape: XpEarnedPublishShape): string {
  return `${shape.userId},${shape.certId},${shape.xpDelta},${shape.idempotencyKey}`;
}

/** L3 — xp publish export header. */
export function xpPublishExportHeader(): string {
  return 'userId,certId,xpDelta,idempotencyKey';
}

/** L3 — full export text for one publish shape. */
export function xpPublishExportText(shape: XpEarnedPublishShape): string {
  return [xpPublishExportHeader(), xpPublishExportLine(shape)].join('\n');
}

/** L3 — board card for publish intent/shape readiness. */
export function xpPublishBoardCard(intent: XpEarnedIntent | null): {
  readonly mayPublish: boolean;
  readonly certId: string | null;
  readonly xpDelta: string | null;
} {
  if (!mayPublishXp(intent)) {
    return { mayPublish: false, certId: null, xpDelta: null };
  }
  return { mayPublish: true, certId: intent.certId, xpDelta: intent.xpDelta };
}
