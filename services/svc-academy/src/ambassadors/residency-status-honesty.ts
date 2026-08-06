/**
 * Academy L3 — pure residency status catalog honesty (no desk I/O).
 *
 * Mirrors residency.ts ResidencyStatus. Does not invent applications.
 */

export const RESIDENCY_STATUSES = ['applied', 'accepted', 'rejected', 'withdrawn'] as const;
export type ResidencyStatusId = (typeof RESIDENCY_STATUSES)[number];

export type ResidencyBoardInput = {
  readonly status: ResidencyStatusId;
  readonly cohort: string;
};

/** L3 — catalog board. */
export function residencyStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly terminalAccepted: number;
  readonly terminalRejected: number;
} {
  return {
    statuses: RESIDENCY_STATUSES.length,
    terminalAccepted: RESIDENCY_STATUSES.includes('accepted') ? 1 : 0,
    terminalRejected: RESIDENCY_STATUSES.includes('rejected') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function residencyStatusCatalogStatusLine(): string {
  const c = residencyStatusCatalogBoardCard();
  return `statuses=${c.statuses} accepted=${c.terminalAccepted} rejected=${c.terminalRejected}`;
}

/** L3 — parse catalog. */
export function parseResidencyStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly accepted: number;
  readonly rejected: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) accepted=([01]) rejected=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    accepted: Number(m[2]),
    rejected: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function residencyStatusCatalogStatusLineMatches(): boolean {
  const p = parseResidencyStatusCatalogStatusLine(residencyStatusCatalogStatusLine());
  if (!p) return false;
  const c = residencyStatusCatalogBoardCard();
  return p.statuses === c.statuses && p.accepted === c.terminalAccepted && p.rejected === c.terminalRejected;
}

/** L3 — four statuses. */
export function residencyStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseResidencyStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 4 && p.accepted === 1 && p.rejected === 1;
}

/** L3 — application list board. */
export function residencyListBoardCard(apps: readonly ResidencyBoardInput[]): {
  readonly applications: number;
  readonly applied: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly withdrawn: number;
  readonly cohorts: number;
} {
  const counts = { applied: 0, accepted: 0, rejected: 0, withdrawn: 0 };
  const cohorts = new Set<string>();
  for (const a of apps) {
    counts[a.status] += 1;
    cohorts.add(a.cohort);
  }
  return {
    applications: apps.length,
    ...counts,
    cohorts: cohorts.size,
  };
}

/** L3 — list status line. */
export function residencyListStatusLine(apps: readonly ResidencyBoardInput[]): string {
  const c = residencyListBoardCard(apps);
  return `applications=${c.applications} applied=${c.applied} accepted=${c.accepted} rejected=${c.rejected} withdrawn=${c.withdrawn} cohorts=${c.cohorts}`;
}

/** L3 — parse list. */
export function parseResidencyListStatusLine(line: string): {
  readonly applications: number;
  readonly applied: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly withdrawn: number;
  readonly cohorts: number;
} | null {
  const m = line.trim().match(/^applications=(\d+) applied=(\d+) accepted=(\d+) rejected=(\d+) withdrawn=(\d+) cohorts=(\d+)$/);
  if (!m) return null;
  return {
    applications: Number(m[1]),
    applied: Number(m[2]),
    accepted: Number(m[3]),
    rejected: Number(m[4]),
    withdrawn: Number(m[5]),
    cohorts: Number(m[6]),
  };
}

/** L3 — true when list status matches. */
export function residencyListStatusLineMatches(apps: readonly ResidencyBoardInput[]): boolean {
  const p = parseResidencyListStatusLine(residencyListStatusLine(apps));
  if (!p) return false;
  const c = residencyListBoardCard(apps);
  return (
    p.applications === c.applications &&
    p.applied === c.applied &&
    p.accepted === c.accepted &&
    p.rejected === c.rejected &&
    p.withdrawn === c.withdrawn &&
    p.cohorts === c.cohorts
  );
}

/** L3 — status parts sum to applications. */
export function residencyListStatusLineConsistent(line: string): boolean {
  const p = parseResidencyListStatusLine(line);
  if (!p) return false;
  return p.applications === p.applied + p.accepted + p.rejected + p.withdrawn && p.cohorts <= p.applications;
}

/** L3 — export header. */
export function residencyListExportHeader(): string {
  return 'applications,applied,accepted,rejected,withdrawn,cohorts';
}

/** L3 — export line. */
export function residencyListExportLine(apps: readonly ResidencyBoardInput[]): string {
  const c = residencyListBoardCard(apps);
  return `${c.applications},${c.applied},${c.accepted},${c.rejected},${c.withdrawn},${c.cohorts}`;
}

/** L3 — full export. */
export function residencyListExportText(apps: readonly ResidencyBoardInput[]): string {
  return [residencyListExportHeader(), residencyListExportLine(apps)].join('\n');
}

/** L3 — status declared. */
export function isDeclaredResidencyStatus(status: string): boolean {
  return (RESIDENCY_STATUSES as readonly string[]).includes(status);
}
