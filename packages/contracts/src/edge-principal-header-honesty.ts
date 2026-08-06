/**
 * Contracts L3 — pure edge principal header-name catalog honesty.
 *
 * Mirrors edge.ts header constants (names only, no crypto).
 */

export const EDGE_PRINCIPAL_HEADERS = ['x-intafaced-principal', 'x-intafaced-principal-sig'] as const;
export type EdgePrincipalHeaderId = (typeof EDGE_PRINCIPAL_HEADERS)[number];

/** L3 — catalog board. */
export function edgePrincipalHeaderCatalogBoardCard(): {
  readonly headers: number;
  readonly hasPrincipal: number;
  readonly hasSig: number;
} {
  return {
    headers: EDGE_PRINCIPAL_HEADERS.length,
    hasPrincipal: EDGE_PRINCIPAL_HEADERS.includes('x-intafaced-principal') ? 1 : 0,
    hasSig: EDGE_PRINCIPAL_HEADERS.includes('x-intafaced-principal-sig') ? 1 : 0,
  };
}

/** L3 — status line. */
export function edgePrincipalHeaderCatalogStatusLine(): string {
  const c = edgePrincipalHeaderCatalogBoardCard();
  return `headers=${c.headers} principal=${c.hasPrincipal} sig=${c.hasSig}`;
}

/** L3 — parse status. */
export function parseEdgePrincipalHeaderCatalogStatusLine(line: string): {
  readonly headers: number;
  readonly principal: number;
  readonly sig: number;
} | null {
  const m = line.trim().match(/^headers=(\d+) principal=([01]) sig=([01])$/);
  if (!m) return null;
  return {
    headers: Number(m[1]),
    principal: Number(m[2]),
    sig: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function edgePrincipalHeaderCatalogStatusLineMatches(): boolean {
  const p = parseEdgePrincipalHeaderCatalogStatusLine(edgePrincipalHeaderCatalogStatusLine());
  if (!p) return false;
  const c = edgePrincipalHeaderCatalogBoardCard();
  return p.headers === c.headers && p.principal === c.hasPrincipal && p.sig === c.hasSig;
}

/** L3 — two headers. */
export function edgePrincipalHeaderCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEdgePrincipalHeaderCatalogStatusLine(line);
  if (!p) return false;
  return p.headers === 2 && p.principal === 1 && p.sig === 1;
}

/** L3 — export header. */
export function edgePrincipalHeaderCatalogExportHeader(): string {
  return 'header';
}

/** L3 — export lines. */
export function edgePrincipalHeaderCatalogExportLines(): readonly string[] {
  return [...EDGE_PRINCIPAL_HEADERS];
}

/** L3 — full export. */
export function edgePrincipalHeaderCatalogExportText(): string {
  return [edgePrincipalHeaderCatalogExportHeader(), ...edgePrincipalHeaderCatalogExportLines()].join('\n');
}

/** L3 — header declared. */
export function isDeclaredEdgePrincipalHeader(h: string): boolean {
  return (EDGE_PRINCIPAL_HEADERS as readonly string[]).includes(h);
}
