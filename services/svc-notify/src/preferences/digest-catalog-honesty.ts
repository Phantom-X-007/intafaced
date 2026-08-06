/**
 * Notify L3 — pure digest cadence catalog honesty boards (no send I/O).
 *
 * Mirrors digest.ts DigestCadence. Critical never digests.
 */

export const DIGEST_CADENCES = ['off', 'hourly', 'daily'] as const;
export type DigestCadenceId = (typeof DIGEST_CADENCES)[number];

export type DigestPrefsInput = {
  readonly cadence: DigestCadenceId;
};

/** L3 — catalog board. */
export function digestCatalogBoardCard(): {
  readonly cadences: number;
  readonly criticalMayDigest: number;
  readonly defaultCadence: string;
} {
  return {
    cadences: DIGEST_CADENCES.length,
    criticalMayDigest: 0,
    defaultCadence: 'off',
  };
}

/** L3 — catalog status line. */
export function digestCatalogStatusLine(): string {
  const c = digestCatalogBoardCard();
  return `cadences=${c.cadences} critical_digest=${c.criticalMayDigest} default=${c.defaultCadence}`;
}

/** L3 — parse catalog. */
export function parseDigestCatalogStatusLine(line: string): {
  readonly cadences: number;
  readonly criticalDigest: number;
  readonly defaultCadence: string;
} | null {
  const m = line.trim().match(/^cadences=(\d+) critical_digest=(\d+) default=(off|hourly|daily)$/);
  if (!m) return null;
  return {
    cadences: Number(m[1]),
    criticalDigest: Number(m[2]),
    defaultCadence: m[3]!,
  };
}

/** L3 — true when catalog matches. */
export function digestCatalogStatusLineMatches(): boolean {
  const p = parseDigestCatalogStatusLine(digestCatalogStatusLine());
  if (!p) return false;
  const c = digestCatalogBoardCard();
  return (
    p.cadences === c.cadences &&
    p.criticalDigest === c.criticalMayDigest &&
    p.defaultCadence === c.defaultCadence
  );
}

/** L3 — critical never digests; default off. */
export function digestCatalogStatusLineConsistent(line: string): boolean {
  const p = parseDigestCatalogStatusLine(line);
  if (!p) return false;
  return p.criticalDigest === 0 && p.defaultCadence === 'off' && p.cadences === DIGEST_CADENCES.length;
}

/** L3 — prefs board. */
export function digestPrefsBoardCard(prefs: DigestPrefsInput): {
  readonly cadence: string;
  readonly isOff: number;
  readonly batches: number;
} {
  return {
    cadence: prefs.cadence,
    isOff: prefs.cadence === 'off' ? 1 : 0,
    batches: prefs.cadence === 'off' ? 0 : 1,
  };
}

/** L3 — prefs status line. */
export function digestPrefsStatusLine(prefs: DigestPrefsInput): string {
  const c = digestPrefsBoardCard(prefs);
  return `cadence=${c.cadence} off=${c.isOff} batches=${c.batches}`;
}

/** L3 — parse prefs. */
export function parseDigestPrefsStatusLine(line: string): {
  readonly cadence: string;
  readonly isOff: number;
  readonly batches: number;
} | null {
  const m = line.trim().match(/^cadence=(off|hourly|daily) off=([01]) batches=([01])$/);
  if (!m) return null;
  return { cadence: m[1]!, isOff: Number(m[2]), batches: Number(m[3]) };
}

/** L3 — true when prefs status matches. */
export function digestPrefsStatusLineMatches(prefs: DigestPrefsInput): boolean {
  const p = parseDigestPrefsStatusLine(digestPrefsStatusLine(prefs));
  if (!p) return false;
  const c = digestPrefsBoardCard(prefs);
  return p.cadence === c.cadence && p.isOff === c.isOff && p.batches === c.batches;
}

/** L3 — off XOR batches. */
export function digestPrefsStatusLineConsistent(line: string): boolean {
  const p = parseDigestPrefsStatusLine(line);
  if (!p) return false;
  return p.isOff + p.batches === 1;
}

/** L3 — export header. */
export function digestPrefsExportHeader(): string {
  return 'cadence,off,batches';
}

/** L3 — export line. */
export function digestPrefsExportLine(prefs: DigestPrefsInput): string {
  const c = digestPrefsBoardCard(prefs);
  return `${c.cadence},${c.isOff},${c.batches}`;
}

/** L3 — full export. */
export function digestPrefsExportText(prefs: DigestPrefsInput): string {
  return [digestPrefsExportHeader(), digestPrefsExportLine(prefs)].join('\n');
}

/** L3 — cadence declared. */
export function isDeclaredDigestCadence(raw: string): boolean {
  return (DIGEST_CADENCES as readonly string[]).includes(raw);
}
