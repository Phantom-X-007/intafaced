/**
 * Academy L3 — pure curriculum import source catalog honesty (no invent library).
 *
 * Mirrors import-pipeline.ts CurriculumContentSource.
 * licensed-import-pending stays residual — never invent DERIV titles.
 */

export const CURRICULUM_CONTENT_SOURCES = ['platform-native-expansion', 'licensed-import-pending'] as const;
export type CurriculumContentSourceId = (typeof CURRICULUM_CONTENT_SOURCES)[number];

export const IMPORT_ISSUE_CODES = ['missing', 'invalid', 'brand', 'path'] as const;
export type ImportIssueCodeId = (typeof IMPORT_ISSUE_CODES)[number];

/** L3 — source catalog board. */
export function importSourceCatalogBoardCard(): {
  readonly sources: number;
  readonly hasPlatformNative: number;
  readonly hasLicensedPending: number;
} {
  return {
    sources: CURRICULUM_CONTENT_SOURCES.length,
    hasPlatformNative: CURRICULUM_CONTENT_SOURCES.includes('platform-native-expansion') ? 1 : 0,
    hasLicensedPending: CURRICULUM_CONTENT_SOURCES.includes('licensed-import-pending') ? 1 : 0,
  };
}

/** L3 — source status line. */
export function importSourceCatalogStatusLine(): string {
  const c = importSourceCatalogBoardCard();
  return `sources=${c.sources} platform_native=${c.hasPlatformNative} licensed_pending=${c.hasLicensedPending}`;
}

/** L3 — parse source. */
export function parseImportSourceCatalogStatusLine(line: string): {
  readonly sources: number;
  readonly platformNative: number;
  readonly licensedPending: number;
} | null {
  const m = line.trim().match(/^sources=(\d+) platform_native=([01]) licensed_pending=([01])$/);
  if (!m) return null;
  return {
    sources: Number(m[1]),
    platformNative: Number(m[2]),
    licensedPending: Number(m[3]),
  };
}

/** L3 — true when source catalog matches. */
export function importSourceCatalogStatusLineMatches(): boolean {
  const p = parseImportSourceCatalogStatusLine(importSourceCatalogStatusLine());
  if (!p) return false;
  const c = importSourceCatalogBoardCard();
  return p.sources === c.sources && p.platformNative === c.hasPlatformNative && p.licensedPending === c.hasLicensedPending;
}

/** L3 — licensed stays pending (not silently shipped). */
export function importSourceCatalogStatusLineConsistent(line: string): boolean {
  const p = parseImportSourceCatalogStatusLine(line);
  if (!p) return false;
  return p.sources === 2 && p.platformNative === 1 && p.licensedPending === 1;
}

/** L3 — issue code catalog. */
export function importIssueCodeCatalogBoardCard(): {
  readonly codes: number;
  readonly hasBrand: number;
  readonly hasPath: number;
} {
  return {
    codes: IMPORT_ISSUE_CODES.length,
    hasBrand: IMPORT_ISSUE_CODES.includes('brand') ? 1 : 0,
    hasPath: IMPORT_ISSUE_CODES.includes('path') ? 1 : 0,
  };
}

/** L3 — issue code status line. */
export function importIssueCodeCatalogStatusLine(): string {
  const c = importIssueCodeCatalogBoardCard();
  return `codes=${c.codes} brand=${c.hasBrand} path=${c.hasPath}`;
}

/** L3 — parse issue codes. */
export function parseImportIssueCodeCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly brand: number;
  readonly path: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) brand=([01]) path=([01])$/);
  if (!m) return null;
  return { codes: Number(m[1]), brand: Number(m[2]), path: Number(m[3]) };
}

/** L3 — true when issue catalog matches. */
export function importIssueCodeCatalogStatusLineMatches(): boolean {
  const p = parseImportIssueCodeCatalogStatusLine(importIssueCodeCatalogStatusLine());
  if (!p) return false;
  const c = importIssueCodeCatalogBoardCard();
  return p.codes === c.codes && p.brand === c.hasBrand && p.path === c.hasPath;
}

/** L3 — brand refuse is present (doctrine §0.7). */
export function importIssueCodeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseImportIssueCodeCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 4 && p.brand === 1;
}

/** L3 — export headers. */
export function importSourceCatalogExportHeader(): string {
  return 'source';
}

/** L3 — export lines. */
export function importSourceCatalogExportLines(): readonly string[] {
  return [...CURRICULUM_CONTENT_SOURCES];
}

/** L3 — full export. */
export function importSourceCatalogExportText(): string {
  return [importSourceCatalogExportHeader(), ...importSourceCatalogExportLines()].join('\n');
}

/** L3 — source declared. */
export function isDeclaredImportSource(source: string): boolean {
  return (CURRICULUM_CONTENT_SOURCES as readonly string[]).includes(source);
}

/** L3 — issue code declared. */
export function isDeclaredImportIssueCode(code: string): boolean {
  return (IMPORT_ISSUE_CODES as readonly string[]).includes(code);
}
