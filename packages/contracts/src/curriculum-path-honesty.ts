/**
 * Contracts L3 — pure curriculum-path catalog honesty (structural only).
 *
 * Mirrors blueprint.ts curriculumPath: foundations | markets | builder | sovereign.
 * Does not invent learning content or money.
 */

export const CURRICULUM_PATHS = ['foundations', 'markets', 'builder', 'sovereign'] as const;
export type CurriculumPathId = (typeof CURRICULUM_PATHS)[number];

/** L3 — catalog board. */
export function curriculumPathCatalogBoardCard(): {
  readonly paths: number;
  readonly hasFoundations: number;
  readonly hasMarkets: number;
  readonly hasBuilder: number;
  readonly hasSovereign: number;
} {
  return {
    paths: CURRICULUM_PATHS.length,
    hasFoundations: CURRICULUM_PATHS.includes('foundations') ? 1 : 0,
    hasMarkets: CURRICULUM_PATHS.includes('markets') ? 1 : 0,
    hasBuilder: CURRICULUM_PATHS.includes('builder') ? 1 : 0,
    hasSovereign: CURRICULUM_PATHS.includes('sovereign') ? 1 : 0,
  };
}

/** L3 — status line. */
export function curriculumPathCatalogStatusLine(): string {
  const c = curriculumPathCatalogBoardCard();
  return `paths=${c.paths} foundations=${c.hasFoundations} markets=${c.hasMarkets} builder=${c.hasBuilder} sovereign=${c.hasSovereign}`;
}

/** L3 — parse status. */
export function parseCurriculumPathCatalogStatusLine(line: string): {
  readonly paths: number;
  readonly foundations: number;
  readonly markets: number;
  readonly builder: number;
  readonly sovereign: number;
} | null {
  const m = line.trim().match(/^paths=(\d+) foundations=([01]) markets=([01]) builder=([01]) sovereign=([01])$/);
  if (!m) return null;
  return {
    paths: Number(m[1]),
    foundations: Number(m[2]),
    markets: Number(m[3]),
    builder: Number(m[4]),
    sovereign: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function curriculumPathCatalogStatusLineMatches(): boolean {
  const p = parseCurriculumPathCatalogStatusLine(curriculumPathCatalogStatusLine());
  if (!p) return false;
  const c = curriculumPathCatalogBoardCard();
  return (
    p.paths === c.paths &&
    p.foundations === c.hasFoundations &&
    p.markets === c.hasMarkets &&
    p.builder === c.hasBuilder &&
    p.sovereign === c.hasSovereign
  );
}

/** L3 — four paths. */
export function curriculumPathCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCurriculumPathCatalogStatusLine(line);
  if (!p) return false;
  return p.paths === 4 && p.foundations === 1 && p.markets === 1 && p.builder === 1 && p.sovereign === 1;
}

/** L3 — export header. */
export function curriculumPathCatalogExportHeader(): string {
  return 'curriculum_path';
}

/** L3 — export lines. */
export function curriculumPathCatalogExportLines(): readonly string[] {
  return [...CURRICULUM_PATHS];
}

/** L3 — full export. */
export function curriculumPathCatalogExportText(): string {
  return [curriculumPathCatalogExportHeader(), ...curriculumPathCatalogExportLines()].join('\n');
}

/** L3 — path declared. */
export function isDeclaredCurriculumPath(path: string): boolean {
  return (CURRICULUM_PATHS as readonly string[]).includes(path);
}
