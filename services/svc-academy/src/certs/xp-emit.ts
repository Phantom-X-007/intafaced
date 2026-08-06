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

/** L3 — parse xp publish export line. Invalid → null. */
export function parseXpPublishExportLine(
  line: string,
): { readonly userId: string; readonly certId: string; readonly xpDelta: string; readonly idempotencyKey: string } | null {
  const t = line.trim();
  if (!t || t === xpPublishExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length !== 4) return null;
  const userId = parts[0]!.trim();
  const certId = parts[1]!.trim();
  const xpDelta = parts[2]!.trim();
  const idempotencyKey = parts[3]!.trim();
  if (!userId || !certId || !xpDelta || !idempotencyKey) return null;
  return { userId, certId, xpDelta, idempotencyKey };
}

/** L3 — data-line count excluding header. */
export function countXpPublishExportDataLines(text: string): number {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== xpPublishExportHeader()).length;
}

/** L3 — true when export has header. */
export function xpPublishExportHasHeader(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? '';
  return first === xpPublishExportHeader();
}

/** L3 — round-trip for xp publish export. */
export function xpPublishExportRoundTripOk(shape: XpEarnedPublishShape): boolean {
  const text = xpPublishExportText(shape);
  return text.split('\n').filter(Boolean).length === 1 + countXpPublishExportDataLines(text);
}

/** L3 — publish readiness status line. */
export function xpPublishStatusLine(intent: XpEarnedIntent | null): string {
  const c = xpPublishBoardCard(intent);
  return `mayPublish=${c.mayPublish ? '1' : '0'} certId=${c.certId ?? '-'} xpDelta=${c.xpDelta ?? '-'}`;
}

/** L3 — true when may not publish. */
export function xpPublishStatusLineIsBlocked(intent: XpEarnedIntent | null): boolean {
  return !mayPublishXp(intent);
}

/** L3 — parse publish status. Invalid → null. */
export function parseXpPublishStatusLine(
  line: string,
): { readonly mayPublish: boolean; readonly certId: string | null; readonly xpDelta: string | null } | null {
  const m = line.trim().match(/^mayPublish=([01]) certId=(\S+) xpDelta=(\S+)$/);
  if (!m) return null;
  return {
    mayPublish: m[1] === '1',
    certId: m[2] === '-' ? null : m[2]!,
    xpDelta: m[3] === '-' ? null : m[3]!,
  };
}

/** L3 — true when status matches board card. */
export function xpPublishStatusLineMatches(intent: XpEarnedIntent | null): boolean {
  const p = parseXpPublishStatusLine(xpPublishStatusLine(intent));
  if (!p) return false;
  const c = xpPublishBoardCard(intent);
  return p.mayPublish === c.mayPublish && p.certId === c.certId && p.xpDelta === c.xpDelta;
}

/** L3 — true when mayPublish implies non-null certId and xpDelta. */
export function xpPublishStatusLineConsistent(line: string): boolean {
  const p = parseXpPublishStatusLine(line);
  if (!p) return false;
  if (!p.mayPublish) return p.certId === null && p.xpDelta === null;
  return p.certId !== null && p.xpDelta !== null;
}
