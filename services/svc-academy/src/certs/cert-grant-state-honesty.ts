/**
 * Academy L3 — pure cert grant-state catalog honesty (structural only).
 *
 * States: not_started | in_progress | grantable | granted.
 * Mirrors progress report lifecycle; no XP invent.
 */

export const CERT_GRANT_STATES = ['not_started', 'in_progress', 'grantable', 'granted'] as const;
export type CertGrantStateId = (typeof CERT_GRANT_STATES)[number];

/** L3 — catalog board. */
export function certGrantStateCatalogBoardCard(): {
  readonly states: number;
  readonly hasNotStarted: number;
  readonly hasInProgress: number;
  readonly hasGrantable: number;
  readonly hasGranted: number;
} {
  return {
    states: CERT_GRANT_STATES.length,
    hasNotStarted: CERT_GRANT_STATES.includes('not_started') ? 1 : 0,
    hasInProgress: CERT_GRANT_STATES.includes('in_progress') ? 1 : 0,
    hasGrantable: CERT_GRANT_STATES.includes('grantable') ? 1 : 0,
    hasGranted: CERT_GRANT_STATES.includes('granted') ? 1 : 0,
  };
}

/** L3 — status line. */
export function certGrantStateCatalogStatusLine(): string {
  const c = certGrantStateCatalogBoardCard();
  return `states=${c.states} not_started=${c.hasNotStarted} in_progress=${c.hasInProgress} grantable=${c.hasGrantable} granted=${c.hasGranted}`;
}

/** L3 — parse status. */
export function parseCertGrantStateCatalogStatusLine(line: string): {
  readonly states: number;
  readonly notStarted: number;
  readonly inProgress: number;
  readonly grantable: number;
  readonly granted: number;
} | null {
  const m = line.trim().match(/^states=(\d+) not_started=([01]) in_progress=([01]) grantable=([01]) granted=([01])$/);
  if (!m) return null;
  return {
    states: Number(m[1]),
    notStarted: Number(m[2]),
    inProgress: Number(m[3]),
    grantable: Number(m[4]),
    granted: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function certGrantStateCatalogStatusLineMatches(): boolean {
  const p = parseCertGrantStateCatalogStatusLine(certGrantStateCatalogStatusLine());
  if (!p) return false;
  const c = certGrantStateCatalogBoardCard();
  return (
    p.states === c.states &&
    p.notStarted === c.hasNotStarted &&
    p.inProgress === c.hasInProgress &&
    p.grantable === c.hasGrantable &&
    p.granted === c.hasGranted
  );
}

/** L3 — four states. */
export function certGrantStateCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCertGrantStateCatalogStatusLine(line);
  if (!p) return false;
  return p.states === 4 && p.notStarted === 1 && p.inProgress === 1 && p.grantable === 1 && p.granted === 1;
}

/** L3 — export header. */
export function certGrantStateCatalogExportHeader(): string {
  return 'state';
}

/** L3 — export lines. */
export function certGrantStateCatalogExportLines(): readonly string[] {
  return [...CERT_GRANT_STATES];
}

/** L3 — full export. */
export function certGrantStateCatalogExportText(): string {
  return [certGrantStateCatalogExportHeader(), ...certGrantStateCatalogExportLines()].join('\n');
}

/** L3 — state declared. */
export function isDeclaredCertGrantState(state: string): boolean {
  return (CERT_GRANT_STATES as readonly string[]).includes(state);
}
