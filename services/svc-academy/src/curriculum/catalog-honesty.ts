/**
 * Academy L3 — pure curriculum catalog honesty boards (no content invent).
 *
 * Structural counts on path/kind/order shapes. Does not invent DERIV//DESK
 * residual titles.
 */

export const CURRICULUM_PATHS = ['foundations', 'markets', 'builder', 'sovereign'] as const;
export const CURRICULUM_KINDS = ['playbook', 'workbook', 'lesson'] as const;

export type CurriculumItemBoardInput = {
  readonly slug: string;
  readonly kind: (typeof CURRICULUM_KINDS)[number];
  readonly path: (typeof CURRICULUM_PATHS)[number];
  readonly order: number;
};

/** L3 — enum catalog board. */
export function curriculumEnumCatalogBoardCard(): {
  readonly paths: number;
  readonly kinds: number;
} {
  return { paths: CURRICULUM_PATHS.length, kinds: CURRICULUM_KINDS.length };
}

/** L3 — enum status line. */
export function curriculumEnumCatalogStatusLine(): string {
  const c = curriculumEnumCatalogBoardCard();
  return `paths=${c.paths} kinds=${c.kinds}`;
}

/** L3 — parse enum. */
export function parseCurriculumEnumCatalogStatusLine(line: string): { readonly paths: number; readonly kinds: number } | null {
  const m = line.trim().match(/^paths=(\d+) kinds=(\d+)$/);
  if (!m) return null;
  return { paths: Number(m[1]), kinds: Number(m[2]) };
}

/** L3 — true when enum matches. */
export function curriculumEnumCatalogStatusLineMatches(): boolean {
  const p = parseCurriculumEnumCatalogStatusLine(curriculumEnumCatalogStatusLine());
  if (!p) return false;
  const c = curriculumEnumCatalogBoardCard();
  return p.paths === c.paths && p.kinds === c.kinds;
}

/** L3 — kind histogram. */
export function curriculumKindHistogram(items: readonly CurriculumItemBoardInput[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.kind] = (out[i.kind] ?? 0) + 1;
  return out;
}

/** L3 — path histogram. */
export function curriculumPathHistogram(items: readonly CurriculumItemBoardInput[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.path] = (out[i.path] ?? 0) + 1;
  return out;
}

/** L3 — board card. */
export function curriculumCatalogueBoardCard(items: readonly CurriculumItemBoardInput[]): {
  readonly items: number;
  readonly playbooks: number;
  readonly workbooks: number;
  readonly lessons: number;
  readonly pathsUsed: number;
} {
  const kh = curriculumKindHistogram(items);
  const paths = new Set(items.map((i) => i.path));
  return {
    items: items.length,
    playbooks: kh.playbook ?? 0,
    workbooks: kh.workbook ?? 0,
    lessons: kh.lesson ?? 0,
    pathsUsed: paths.size,
  };
}

/** L3 — status line. */
export function curriculumCatalogueStatusLine(items: readonly CurriculumItemBoardInput[]): string {
  const c = curriculumCatalogueBoardCard(items);
  return `items=${c.items} playbooks=${c.playbooks} workbooks=${c.workbooks} lessons=${c.lessons} paths_used=${c.pathsUsed}`;
}

/** L3 — parse catalogue. */
export function parseCurriculumCatalogueStatusLine(line: string): {
  readonly items: number;
  readonly playbooks: number;
  readonly workbooks: number;
  readonly lessons: number;
  readonly pathsUsed: number;
} | null {
  const m = line.trim().match(/^items=(\d+) playbooks=(\d+) workbooks=(\d+) lessons=(\d+) paths_used=(\d+)$/);
  if (!m) return null;
  return {
    items: Number(m[1]),
    playbooks: Number(m[2]),
    workbooks: Number(m[3]),
    lessons: Number(m[4]),
    pathsUsed: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function curriculumCatalogueStatusLineMatches(items: readonly CurriculumItemBoardInput[]): boolean {
  const p = parseCurriculumCatalogueStatusLine(curriculumCatalogueStatusLine(items));
  if (!p) return false;
  const c = curriculumCatalogueBoardCard(items);
  return (
    p.items === c.items &&
    p.playbooks === c.playbooks &&
    p.workbooks === c.workbooks &&
    p.lessons === c.lessons &&
    p.pathsUsed === c.pathsUsed
  );
}

/** L3 — kinds sum to items; pathsUsed ≤ items. */
export function curriculumCatalogueStatusLineConsistent(line: string): boolean {
  const p = parseCurriculumCatalogueStatusLine(line);
  if (!p) return false;
  return p.items === p.playbooks + p.workbooks + p.lessons && p.pathsUsed <= p.items;
}

/** L3 — export header. */
export function curriculumCatalogueExportHeader(): string {
  return 'items,playbooks,workbooks,lessons,paths_used';
}

/** L3 — export line. */
export function curriculumCatalogueExportLine(items: readonly CurriculumItemBoardInput[]): string {
  const c = curriculumCatalogueBoardCard(items);
  return `${c.items},${c.playbooks},${c.workbooks},${c.lessons},${c.pathsUsed}`;
}

/** L3 — full export. */
export function curriculumCatalogueExportText(items: readonly CurriculumItemBoardInput[]): string {
  return [curriculumCatalogueExportHeader(), curriculumCatalogueExportLine(items)].join('\n');
}

/** L3 — path declared. */
export function isDeclaredCurriculumPath(path: string): boolean {
  return (CURRICULUM_PATHS as readonly string[]).includes(path);
}

/** L3 — count in range. */
export function curriculumItemCountInRange(items: readonly CurriculumItemBoardInput[], min: number, max: number): boolean {
  if (min > max) return false;
  const n = items.length;
  return n >= min && n <= max;
}
