/**
 * Academy L3 — pure ambassador freeze-reason honesty boards (no programme I/O).
 *
 * Structural rules only: non-empty reason required for freeze audit.
 * Does not invent pay/revenue language.
 */

export type FreezeReasonBoardInput = {
  readonly reason: string | null | undefined;
};

/** L3 — pure: trimmed reason length; empty/null → 0. */
export function freezeReasonLength(input: FreezeReasonBoardInput): number {
  return (input.reason ?? '').trim().length;
}

/** L3 — true when reason is non-empty after trim. */
export function freezeReasonPresent(input: FreezeReasonBoardInput): boolean {
  return freezeReasonLength(input) > 0;
}

/** L3 — board card. */
export function freezeReasonBoardCard(input: FreezeReasonBoardInput): {
  readonly length: number;
  readonly present: number;
  readonly empty: number;
} {
  const length = freezeReasonLength(input);
  return {
    length,
    present: length > 0 ? 1 : 0,
    empty: length > 0 ? 0 : 1,
  };
}

/** L3 — status line. */
export function freezeReasonStatusLine(input: FreezeReasonBoardInput): string {
  const c = freezeReasonBoardCard(input);
  return `length=${c.length} present=${c.present} empty=${c.empty}`;
}

/** L3 — parse status. */
export function parseFreezeReasonStatusLine(line: string): {
  readonly length: number;
  readonly present: number;
  readonly empty: number;
} | null {
  const m = line.trim().match(/^length=(\d+) present=([01]) empty=([01])$/);
  if (!m) return null;
  return {
    length: Number(m[1]),
    present: Number(m[2]),
    empty: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function freezeReasonStatusLineMatches(input: FreezeReasonBoardInput): boolean {
  const p = parseFreezeReasonStatusLine(freezeReasonStatusLine(input));
  if (!p) return false;
  const c = freezeReasonBoardCard(input);
  return p.length === c.length && p.present === c.present && p.empty === c.empty;
}

/** L3 — present XOR empty; empty iff length 0. */
export function freezeReasonStatusLineConsistent(line: string): boolean {
  const p = parseFreezeReasonStatusLine(line);
  if (!p) return false;
  return p.present + p.empty === 1 && p.empty === (p.length === 0 ? 1 : 0);
}

/** L3 — export header. */
export function freezeReasonExportHeader(): string {
  return 'length,present,empty';
}

/** L3 — export line. */
export function freezeReasonExportLine(input: FreezeReasonBoardInput): string {
  const c = freezeReasonBoardCard(input);
  return `${c.length},${c.present},${c.empty}`;
}

/** L3 — full export. */
export function freezeReasonExportText(input: FreezeReasonBoardInput): string {
  return [freezeReasonExportHeader(), freezeReasonExportLine(input)].join('\n');
}

/** L3 — length in range. */
export function freezeReasonLengthInRange(
  input: FreezeReasonBoardInput,
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = freezeReasonLength(input);
  return n >= min && n <= max;
}
