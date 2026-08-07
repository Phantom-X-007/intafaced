/**
 * Agents L3 — pure completion stop-reason catalog honesty (structural only).
 *
 * Mirrors provider.ts StopReason: end | max_tokens | stop_sequence | refusal.
 * Does not invent token billing or vendor stop semantics.
 */

export const STOP_REASONS = ['end', 'max_tokens', 'stop_sequence', 'refusal'] as const;
export type StopReasonId = (typeof STOP_REASONS)[number];

/** L3 — catalog board. */
export function stopReasonCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasEnd: number;
  readonly hasMaxTokens: number;
  readonly hasStopSequence: number;
  readonly hasRefusal: number;
} {
  return {
    reasons: STOP_REASONS.length,
    hasEnd: STOP_REASONS.includes('end') ? 1 : 0,
    hasMaxTokens: STOP_REASONS.includes('max_tokens') ? 1 : 0,
    hasStopSequence: STOP_REASONS.includes('stop_sequence') ? 1 : 0,
    hasRefusal: STOP_REASONS.includes('refusal') ? 1 : 0,
  };
}

/** L3 — status line. */
export function stopReasonCatalogStatusLine(): string {
  const c = stopReasonCatalogBoardCard();
  return `reasons=${c.reasons} end=${c.hasEnd} max_tokens=${c.hasMaxTokens} stop_sequence=${c.hasStopSequence} refusal=${c.hasRefusal}`;
}

/** L3 — parse status. */
export function parseStopReasonCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly end: number;
  readonly maxTokens: number;
  readonly stopSequence: number;
  readonly refusal: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) end=([01]) max_tokens=([01]) stop_sequence=([01]) refusal=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    end: Number(m[2]),
    maxTokens: Number(m[3]),
    stopSequence: Number(m[4]),
    refusal: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function stopReasonCatalogStatusLineMatches(): boolean {
  const p = parseStopReasonCatalogStatusLine(stopReasonCatalogStatusLine());
  if (!p) return false;
  const c = stopReasonCatalogBoardCard();
  return (
    p.reasons === c.reasons &&
    p.end === c.hasEnd &&
    p.maxTokens === c.hasMaxTokens &&
    p.stopSequence === c.hasStopSequence &&
    p.refusal === c.hasRefusal
  );
}

/** L3 — four stop reasons declared. */
export function stopReasonCatalogStatusLineConsistent(line: string): boolean {
  const p = parseStopReasonCatalogStatusLine(line);
  if (!p) return false;
  return p.reasons === 4 && p.end === 1 && p.maxTokens === 1 && p.stopSequence === 1 && p.refusal === 1;
}

/** L3 — export header. */
export function stopReasonCatalogExportHeader(): string {
  return 'stop_reason';
}

/** L3 — export lines. */
export function stopReasonCatalogExportLines(): readonly string[] {
  return [...STOP_REASONS];
}

/** L3 — full export. */
export function stopReasonCatalogExportText(): string {
  return [stopReasonCatalogExportHeader(), ...stopReasonCatalogExportLines()].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredStopReason(reason: string): boolean {
  return (STOP_REASONS as readonly string[]).includes(reason);
}
