/**
 * Academy L3 — pure cert progress report honesty boards (no XP invent).
 *
 * Structural progress shapes only.
 */

export type CertProgressBoardInput = {
  readonly enrolled: number;
  readonly completedItems: number;
  readonly requiredItems: number;
  readonly granted: number;
};

/** L3 — board card. */
export function certProgressBoardCard(input: CertProgressBoardInput): {
  readonly enrolled: number;
  readonly completed: number;
  readonly required: number;
  readonly granted: number;
  readonly complete: number;
} {
  const complete = input.requiredItems > 0 && input.completedItems >= input.requiredItems ? 1 : 0;
  return {
    enrolled: input.enrolled,
    completed: input.completedItems,
    required: input.requiredItems,
    granted: input.granted,
    complete,
  };
}

/** L3 — status line. */
export function certProgressStatusLine(input: CertProgressBoardInput): string {
  const c = certProgressBoardCard(input);
  return `enrolled=${c.enrolled} completed=${c.completed} required=${c.required} granted=${c.granted} complete=${c.complete}`;
}

/** L3 — parse status. */
export function parseCertProgressStatusLine(line: string): {
  readonly enrolled: number;
  readonly completed: number;
  readonly required: number;
  readonly granted: number;
  readonly complete: number;
} | null {
  const m = line.trim().match(/^enrolled=(\d+) completed=(\d+) required=(\d+) granted=(\d+) complete=([01])$/);
  if (!m) return null;
  return {
    enrolled: Number(m[1]),
    completed: Number(m[2]),
    required: Number(m[3]),
    granted: Number(m[4]),
    complete: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function certProgressStatusLineMatches(input: CertProgressBoardInput): boolean {
  const p = parseCertProgressStatusLine(certProgressStatusLine(input));
  if (!p) return false;
  const c = certProgressBoardCard(input);
  return (
    p.enrolled === c.enrolled &&
    p.completed === c.completed &&
    p.required === c.required &&
    p.granted === c.granted &&
    p.complete === c.complete
  );
}

/** L3 — complete flag matches completed>=required when required>0. */
export function certProgressStatusLineConsistent(line: string): boolean {
  const p = parseCertProgressStatusLine(line);
  if (!p) return false;
  const expect = p.required > 0 && p.completed >= p.required ? 1 : 0;
  return p.complete === expect && p.granted <= 1;
}

/** L3 — export header. */
export function certProgressExportHeader(): string {
  return 'enrolled,completed,required,granted,complete';
}

/** L3 — export line. */
export function certProgressExportLine(input: CertProgressBoardInput): string {
  const c = certProgressBoardCard(input);
  return `${c.enrolled},${c.completed},${c.required},${c.granted},${c.complete}`;
}

/** L3 — full export. */
export function certProgressExportText(input: CertProgressBoardInput): string {
  return [certProgressExportHeader(), certProgressExportLine(input)].join('\n');
}

/** L3 — incomplete cannot grant (board rule). */
export function certIncompleteBlocksGrant(input: CertProgressBoardInput): boolean {
  const c = certProgressBoardCard(input);
  if (c.complete === 0) return c.granted === 0;
  return true;
}
