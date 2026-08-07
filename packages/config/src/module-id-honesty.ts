/**
 * Config L3 — pure platform module-id catalog honesty (structural only).
 *
 * Mirrors modules.ts MODULE_IDS (Phase 1–5 + protocol plane).
 * Does not invent product law or module enablement numbers.
 */

import { MODULE_IDS } from './modules.js';

export { MODULE_IDS };
export type ModuleIdHonestyId = (typeof MODULE_IDS)[number];

/** L3 — catalog board. */
export function moduleIdCatalogBoardCard(): {
  readonly modules: number;
  readonly hasIdentity: number;
  readonly hasLedger: number;
  readonly hasTrade: number;
  readonly hasEdge: number;
  readonly hasProtocol: number;
} {
  const ids = MODULE_IDS as readonly string[];
  return {
    modules: MODULE_IDS.length,
    hasIdentity: ids.includes('identity') ? 1 : 0,
    hasLedger: ids.includes('ledger') ? 1 : 0,
    hasTrade: ids.includes('trade') ? 1 : 0,
    hasEdge: ids.includes('edge') ? 1 : 0,
    hasProtocol: ids.includes('protocol') ? 1 : 0,
  };
}

/** L3 — status line. */
export function moduleIdCatalogStatusLine(): string {
  const c = moduleIdCatalogBoardCard();
  return `modules=${c.modules} identity=${c.hasIdentity} ledger=${c.hasLedger} trade=${c.hasTrade} edge=${c.hasEdge} protocol=${c.hasProtocol}`;
}

/** L3 — parse status. */
export function parseModuleIdCatalogStatusLine(line: string): {
  readonly modules: number;
  readonly identity: number;
  readonly ledger: number;
  readonly trade: number;
  readonly edge: number;
  readonly protocol: number;
} | null {
  const m = line.trim().match(/^modules=(\d+) identity=([01]) ledger=([01]) trade=([01]) edge=([01]) protocol=([01])$/);
  if (!m) return null;
  return {
    modules: Number(m[1]),
    identity: Number(m[2]),
    ledger: Number(m[3]),
    trade: Number(m[4]),
    edge: Number(m[5]),
    protocol: Number(m[6]),
  };
}

/** L3 — true when status matches. */
export function moduleIdCatalogStatusLineMatches(): boolean {
  const p = parseModuleIdCatalogStatusLine(moduleIdCatalogStatusLine());
  if (!p) return false;
  const c = moduleIdCatalogBoardCard();
  return (
    p.modules === c.modules &&
    p.identity === c.hasIdentity &&
    p.ledger === c.hasLedger &&
    p.trade === c.hasTrade &&
    p.edge === c.hasEdge &&
    p.protocol === c.hasProtocol
  );
}

/** L3 — tip count + core modules present. */
export function moduleIdCatalogStatusLineConsistent(line: string): boolean {
  const p = parseModuleIdCatalogStatusLine(line);
  if (!p) return false;
  return p.modules === MODULE_IDS.length && p.identity === 1 && p.ledger === 1 && p.trade === 1 && p.edge === 1 && p.protocol === 1;
}

/** L3 — export header. */
export function moduleIdCatalogExportHeader(): string {
  return 'module_id';
}

/** L3 — export lines. */
export function moduleIdCatalogExportLines(): readonly string[] {
  return [...MODULE_IDS];
}

/** L3 — full export. */
export function moduleIdCatalogExportText(): string {
  return [moduleIdCatalogExportHeader(), ...moduleIdCatalogExportLines()].join('\n');
}

/** L3 — module declared. */
export function isDeclaredModuleId(id: string): boolean {
  return (MODULE_IDS as readonly string[]).includes(id);
}
