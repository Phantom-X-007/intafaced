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
