/**
 * Notify L3 — pure channel refusal-code catalog honesty (no send I/O).
 *
 * Mirrors channel.ts allRefusalCodes list. Codes only — no vendor names.
 */

import { allRefusalCodes, refusalCodeCount } from './channel.js';

/** L3 — catalog board. */
export function refusalCodeCatalogBoardCard(): {
  readonly codes: number;
  readonly hasNotConfigured: number;
  readonly hasMuted: number;
  readonly hasAttemptsExhausted: number;
} {
  const codes = allRefusalCodes();
  return {
    codes: codes.length,
    hasNotConfigured: codes.includes('channel.not_configured') ? 1 : 0,
    hasMuted: codes.includes('channel.muted') ? 1 : 0,
    hasAttemptsExhausted: codes.includes('channel.attempts_exhausted') ? 1 : 0,
  };
}

/** L3 — status line. */
export function refusalCodeCatalogStatusLine(): string {
  const c = refusalCodeCatalogBoardCard();
  return `codes=${c.codes} not_configured=${c.hasNotConfigured} muted=${c.hasMuted} attempts_exhausted=${c.hasAttemptsExhausted}`;
}

/** L3 — parse status. */
export function parseRefusalCodeCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly notConfigured: number;
  readonly muted: number;
  readonly attemptsExhausted: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) not_configured=([01]) muted=([01]) attempts_exhausted=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    notConfigured: Number(m[2]),
    muted: Number(m[3]),
    attemptsExhausted: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function refusalCodeCatalogStatusLineMatches(): boolean {
  const p = parseRefusalCodeCatalogStatusLine(refusalCodeCatalogStatusLine());
  if (!p) return false;
  const c = refusalCodeCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.notConfigured === c.hasNotConfigured &&
    p.muted === c.hasMuted &&
    p.attemptsExhausted === c.hasAttemptsExhausted
  );
}

/** L3 — codes match refusalCodeCount. */
export function refusalCodeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRefusalCodeCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === refusalCodeCount() && p.notConfigured === 1;
}

/** L3 — export header. */
export function refusalCodeCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function refusalCodeCatalogExportLines(): readonly string[] {
  return allRefusalCodes().map((c) => c);
}

/** L3 — full export. */
export function refusalCodeCatalogExportText(): string {
  return [refusalCodeCatalogExportHeader(), ...refusalCodeCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredRefusalCode(code: string): boolean {
  return (allRefusalCodes() as readonly string[]).includes(code);
}

/** L3 — count in range. */
export function refusalCodeCountInRange(min: number, max: number): boolean {
  if (min > max) return false;
  const n = refusalCodeCount();
  return n >= min && n <= max;
}
