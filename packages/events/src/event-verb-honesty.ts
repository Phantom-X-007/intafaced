/**
 * Events L3 — pure NATS event-verb catalog honesty (structural only).
 *
 * Mirrors subject.ts VERBS (past-tense closed list).
 * Does not invent new verbs or subject law.
 */

export const EVENT_VERBS = [
  'created',
  'updated',
  'deleted',
  'posted',
  'accepted',
  'rejected',
  'cancelled',
  'filled',
  'settled',
  'failed',
  'expired',
  'locked',
  'released',
  'refunded',
  'earned',
  'approved',
  'opened',
  'closed',
  'started',
  'completed',
  'liquidated',
  'disputed',
  'resolved',
  'requested',
  'confirmed',
  'reversed',
  'frozen',
  'attested',
] as const;
export type EventVerbId = (typeof EVENT_VERBS)[number];

/** L3 — catalog board. */
export function eventVerbCatalogBoardCard(): {
  readonly verbs: number;
  readonly hasPosted: number;
  readonly hasSettled: number;
  readonly hasLiquidated: number;
  readonly hasAttested: number;
} {
  return {
    verbs: EVENT_VERBS.length,
    hasPosted: EVENT_VERBS.includes('posted') ? 1 : 0,
    hasSettled: EVENT_VERBS.includes('settled') ? 1 : 0,
    hasLiquidated: EVENT_VERBS.includes('liquidated') ? 1 : 0,
    hasAttested: EVENT_VERBS.includes('attested') ? 1 : 0,
  };
}

/** L3 — status line. */
export function eventVerbCatalogStatusLine(): string {
  const c = eventVerbCatalogBoardCard();
  return `verbs=${c.verbs} posted=${c.hasPosted} settled=${c.hasSettled} liquidated=${c.hasLiquidated} attested=${c.hasAttested}`;
}

/** L3 — parse status. */
export function parseEventVerbCatalogStatusLine(line: string): {
  readonly verbs: number;
  readonly posted: number;
  readonly settled: number;
  readonly liquidated: number;
  readonly attested: number;
} | null {
  const m = line.trim().match(/^verbs=(\d+) posted=([01]) settled=([01]) liquidated=([01]) attested=([01])$/);
  if (!m) return null;
  return {
    verbs: Number(m[1]),
    posted: Number(m[2]),
    settled: Number(m[3]),
    liquidated: Number(m[4]),
    attested: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function eventVerbCatalogStatusLineMatches(): boolean {
  const p = parseEventVerbCatalogStatusLine(eventVerbCatalogStatusLine());
  if (!p) return false;
  const c = eventVerbCatalogBoardCard();
  return (
    p.verbs === c.verbs &&
    p.posted === c.hasPosted &&
    p.settled === c.hasSettled &&
    p.liquidated === c.hasLiquidated &&
    p.attested === c.hasAttested
  );
}

/** L3 — closed list size. */
export function eventVerbCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEventVerbCatalogStatusLine(line);
  if (!p) return false;
  return p.verbs === 28 && p.posted === 1 && p.settled === 1 && p.liquidated === 1 && p.attested === 1;
}

/** L3 — export header. */
export function eventVerbCatalogExportHeader(): string {
  return 'event_verb';
}

/** L3 — export lines. */
export function eventVerbCatalogExportLines(): readonly string[] {
  return [...EVENT_VERBS];
}

/** L3 — full export. */
export function eventVerbCatalogExportText(): string {
  return [eventVerbCatalogExportHeader(), ...eventVerbCatalogExportLines()].join('\n');
}

/** L3 — verb declared. */
export function isDeclaredEventVerb(verb: string): boolean {
  return (EVENT_VERBS as readonly string[]).includes(verb);
}
