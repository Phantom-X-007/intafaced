/**
 * Contracts L3 — pure raw-body retention catalog honesty (no Fastify I/O).
 *
 * Mirrors raw-body.ts default content types. Does not invent body bytes.
 */

export const RAW_BODY_DEFAULT_CONTENT_TYPES = ['application/json'] as const;

/** L3 — catalog board. */
export function rawBodyCatalogBoardCard(): {
  readonly contentTypes: number;
  readonly hasJson: number;
  readonly hasMultipart: number;
} {
  return {
    contentTypes: RAW_BODY_DEFAULT_CONTENT_TYPES.length,
    hasJson: RAW_BODY_DEFAULT_CONTENT_TYPES.includes('application/json') ? 1 : 0,
    hasMultipart: 0,
  };
}

/** L3 — status line. */
export function rawBodyCatalogStatusLine(): string {
  const c = rawBodyCatalogBoardCard();
  return `content_types=${c.contentTypes} json=${c.hasJson} multipart=${c.hasMultipart}`;
}

/** L3 — parse status. */
export function parseRawBodyCatalogStatusLine(line: string): {
  readonly contentTypes: number;
  readonly json: number;
  readonly multipart: number;
} | null {
  const m = line.trim().match(/^content_types=(\d+) json=([01]) multipart=([01])$/);
  if (!m) return null;
  return {
    contentTypes: Number(m[1]),
    json: Number(m[2]),
    multipart: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function rawBodyCatalogStatusLineMatches(): boolean {
  const p = parseRawBodyCatalogStatusLine(rawBodyCatalogStatusLine());
  if (!p) return false;
  const c = rawBodyCatalogBoardCard();
  return (
    p.contentTypes === c.contentTypes &&
    p.json === c.hasJson &&
    p.multipart === c.hasMultipart
  );
}

/** L3 — json retained by default; multipart not default. */
export function rawBodyCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRawBodyCatalogStatusLine(line);
  if (!p) return false;
  return p.json === 1 && p.multipart === 0 && p.contentTypes >= 1;
}

/** L3 — export header. */
export function rawBodyCatalogExportHeader(): string {
  return 'content_types,json,multipart';
}

/** L3 — export line. */
export function rawBodyCatalogExportLine(): string {
  const c = rawBodyCatalogBoardCard();
  return `${c.contentTypes},${c.hasJson},${c.hasMultipart}`;
}

/** L3 — full export. */
export function rawBodyCatalogExportText(): string {
  return [rawBodyCatalogExportHeader(), rawBodyCatalogExportLine()].join('\n');
}

/** L3 — type declared in default set. */
export function isDefaultRawBodyContentType(type: string): boolean {
  return (RAW_BODY_DEFAULT_CONTENT_TYPES as readonly string[]).includes(type);
}

/** L3 — names. */
export function rawBodyDefaultContentTypes(): readonly string[] {
  return [...RAW_BODY_DEFAULT_CONTENT_TYPES];
}
