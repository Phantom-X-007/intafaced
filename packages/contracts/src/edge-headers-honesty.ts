/**
 * Contracts L3 — pure edge trust header catalog honesty (no crypto I/O).
 *
 * Mirrors edge.ts header name constants. Does not invent principal claims.
 */

export const EDGE_PRINCIPAL_HEADER_NAME = 'x-intafaced-principal';
export const EDGE_SIGNATURE_HEADER_NAME = 'x-intafaced-principal-sig';

export const EDGE_HEADER_CATALOG = [
  EDGE_PRINCIPAL_HEADER_NAME,
  EDGE_SIGNATURE_HEADER_NAME,
] as const;

/** L3 — catalog size. */
export function edgeHeaderCatalogSize(): number {
  return EDGE_HEADER_CATALOG.length;
}

/** L3 — true when name is declared. */
export function isDeclaredEdgeHeader(name: string): boolean {
  return (EDGE_HEADER_CATALOG as readonly string[]).includes(name.toLowerCase())
    || (EDGE_HEADER_CATALOG as readonly string[]).includes(name);
}

/** L3 — board card. */
export function edgeHeaderCatalogBoardCard(): {
  readonly headers: number;
  readonly hasPrincipal: number;
  readonly hasSignature: number;
} {
  return {
    headers: EDGE_HEADER_CATALOG.length,
    hasPrincipal: EDGE_HEADER_CATALOG.includes(EDGE_PRINCIPAL_HEADER_NAME) ? 1 : 0,
    hasSignature: EDGE_HEADER_CATALOG.includes(EDGE_SIGNATURE_HEADER_NAME) ? 1 : 0,
  };
}

/** L3 — status line. */
export function edgeHeaderCatalogStatusLine(): string {
  const c = edgeHeaderCatalogBoardCard();
  return `headers=${c.headers} principal=${c.hasPrincipal} signature=${c.hasSignature}`;
}

/** L3 — parse status. */
export function parseEdgeHeaderCatalogStatusLine(line: string): {
  readonly headers: number;
  readonly principal: number;
  readonly signature: number;
} | null {
  const m = line.trim().match(/^headers=(\d+) principal=([01]) signature=([01])$/);
  if (!m) return null;
  return {
    headers: Number(m[1]),
    principal: Number(m[2]),
    signature: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function edgeHeaderCatalogStatusLineMatches(): boolean {
  const p = parseEdgeHeaderCatalogStatusLine(edgeHeaderCatalogStatusLine());
  if (!p) return false;
  const c = edgeHeaderCatalogBoardCard();
  return (
    p.headers === c.headers &&
    p.principal === c.hasPrincipal &&
    p.signature === c.hasSignature
  );
}

/** L3 — both principal and signature required for trust. */
export function edgeHeaderCatalogStatusLineConsistent(line: string): boolean {
  const p = parseEdgeHeaderCatalogStatusLine(line);
  if (!p) return false;
  return p.headers === 2 && p.principal === 1 && p.signature === 1;
}

/** L3 — export header. */
export function edgeHeaderCatalogExportHeader(): string {
  return 'headers,principal,signature';
}

/** L3 — export line. */
export function edgeHeaderCatalogExportLine(): string {
  const c = edgeHeaderCatalogBoardCard();
  return `${c.headers},${c.hasPrincipal},${c.hasSignature}`;
}

/** L3 — full export. */
export function edgeHeaderCatalogExportText(): string {
  return [edgeHeaderCatalogExportHeader(), edgeHeaderCatalogExportLine()].join('\n');
}

/** L3 — names list. */
export function edgeHeaderNames(): readonly string[] {
  return [...EDGE_HEADER_CATALOG];
}
