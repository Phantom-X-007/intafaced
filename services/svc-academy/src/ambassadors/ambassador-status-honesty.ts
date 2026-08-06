/**
 * Academy L3 — pure ambassador programme status honesty boards (no pay invent).
 *
 * Status catalog only: active | frozen. No revenue share / ledger.
 */

export const AMBASSADOR_STATUSES = ['active', 'frozen'] as const;
export type AmbassadorStatusId = (typeof AMBASSADOR_STATUSES)[number];

export type AmbassadorBoardInput = {
  readonly userId: string;
  readonly status: AmbassadorStatusId;
};

/** L3 — catalog board. */
export function ambassadorStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasActive: number;
  readonly hasFrozen: number;
  readonly hasPayPath: number;
} {
  return {
    statuses: AMBASSADOR_STATUSES.length,
    hasActive: 1,
    hasFrozen: 1,
    hasPayPath: 0,
  };
}

/** L3 — catalog status line. */
export function ambassadorStatusCatalogStatusLine(): string {
  const c = ambassadorStatusCatalogBoardCard();
  return `statuses=${c.statuses} active=${c.hasActive} frozen=${c.hasFrozen} pay=${c.hasPayPath}`;
}

/** L3 — parse catalog. */
export function parseAmbassadorStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly active: number;
  readonly frozen: number;
  readonly pay: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) active=([01]) frozen=([01]) pay=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    active: Number(m[2]),
    frozen: Number(m[3]),
    pay: Number(m[4]),
  };
}

/** L3 — true when catalog matches. */
export function ambassadorStatusCatalogStatusLineMatches(): boolean {
  const p = parseAmbassadorStatusCatalogStatusLine(ambassadorStatusCatalogStatusLine());
  if (!p) return false;
  const c = ambassadorStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.active === c.hasActive &&
    p.frozen === c.hasFrozen &&
    p.pay === c.hasPayPath
  );
}

/** L3 — Stage-1 has no pay path. */
export function ambassadorStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseAmbassadorStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.pay === 0 && p.statuses === 2;
}

/** L3 — list board. */
export function ambassadorListBoardCard(rows: readonly AmbassadorBoardInput[]): {
  readonly total: number;
  readonly active: number;
  readonly frozen: number;
} {
  let active = 0;
  let frozen = 0;
  for (const r of rows) {
    if (r.status === 'active') active += 1;
    else frozen += 1;
  }
  return { total: rows.length, active, frozen };
}

/** L3 — list status line. */
export function ambassadorListStatusLine(rows: readonly AmbassadorBoardInput[]): string {
  const c = ambassadorListBoardCard(rows);
  return `total=${c.total} active=${c.active} frozen=${c.frozen}`;
}

/** L3 — parse list. */
export function parseAmbassadorListStatusLine(line: string): {
  readonly total: number;
  readonly active: number;
  readonly frozen: number;
} | null {
  const m = line.trim().match(/^total=(\d+) active=(\d+) frozen=(\d+)$/);
  if (!m) return null;
  return { total: Number(m[1]), active: Number(m[2]), frozen: Number(m[3]) };
}

/** L3 — true when list status matches. */
export function ambassadorListStatusLineMatches(rows: readonly AmbassadorBoardInput[]): boolean {
  const p = parseAmbassadorListStatusLine(ambassadorListStatusLine(rows));
  if (!p) return false;
  const c = ambassadorListBoardCard(rows);
  return p.total === c.total && p.active === c.active && p.frozen === c.frozen;
}

/** L3 — active+frozen equals total. */
export function ambassadorListStatusLineConsistent(line: string): boolean {
  const p = parseAmbassadorListStatusLine(line);
  if (!p) return false;
  return p.total === p.active + p.frozen;
}

/** L3 — export header. */
export function ambassadorListExportHeader(): string {
  return 'total,active,frozen';
}

/** L3 — export line. */
export function ambassadorListExportLine(rows: readonly AmbassadorBoardInput[]): string {
  const c = ambassadorListBoardCard(rows);
  return `${c.total},${c.active},${c.frozen}`;
}

/** L3 — full export. */
export function ambassadorListExportText(rows: readonly AmbassadorBoardInput[]): string {
  return [ambassadorListExportHeader(), ambassadorListExportLine(rows)].join('\n');
}

/** L3 — badge true only for active. */
export function ambassadorBadgeIsActive(status: AmbassadorStatusId | null): boolean {
  return status === 'active';
}

/** L3 — status declared. */
export function isDeclaredAmbassadorStatus(status: string): boolean {
  return (AMBASSADOR_STATUSES as readonly string[]).includes(status);
}
