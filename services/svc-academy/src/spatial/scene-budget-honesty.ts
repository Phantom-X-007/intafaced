/**
 * Academy L3 — pure spatial scene budget honesty boards (no room I/O).
 *
 * Mirrors scene.ts SCENE_MAX_BYTES + SCENE_VERSION. No invent scene content.
 */

export const SCENE_MAX_BYTES = 64 * 1024;
export const SCENE_VERSION = 1;

export type SceneBudgetBoardInput = {
  readonly byteSize: number;
  readonly version: number;
  readonly avatarCount: number;
  readonly propCount: number;
};

/** L3 — catalog board. */
export function sceneBudgetCatalogBoardCard(): {
  readonly maxBytes: number;
  readonly version: number;
} {
  return { maxBytes: SCENE_MAX_BYTES, version: SCENE_VERSION };
}

/** L3 — catalog status line. */
export function sceneBudgetCatalogStatusLine(): string {
  const c = sceneBudgetCatalogBoardCard();
  return `max_bytes=${c.maxBytes} version=${c.version}`;
}

/** L3 — parse catalog. */
export function parseSceneBudgetCatalogStatusLine(line: string): { readonly maxBytes: number; readonly version: number } | null {
  const m = line.trim().match(/^max_bytes=(\d+) version=(\d+)$/);
  if (!m) return null;
  return { maxBytes: Number(m[1]), version: Number(m[2]) };
}

/** L3 — true when catalog matches. */
export function sceneBudgetCatalogStatusLineMatches(): boolean {
  const p = parseSceneBudgetCatalogStatusLine(sceneBudgetCatalogStatusLine());
  if (!p) return false;
  const c = sceneBudgetCatalogBoardCard();
  return p.maxBytes === c.maxBytes && p.version === c.version;
}

/** L3 — scene board. */
export function sceneBudgetBoardCard(input: SceneBudgetBoardInput): {
  readonly bytes: number;
  readonly version: number;
  readonly avatars: number;
  readonly props: number;
  readonly withinBudget: number;
} {
  return {
    bytes: input.byteSize,
    version: input.version,
    avatars: input.avatarCount,
    props: input.propCount,
    withinBudget: input.byteSize <= SCENE_MAX_BYTES ? 1 : 0,
  };
}

/** L3 — status line. */
export function sceneBudgetStatusLine(input: SceneBudgetBoardInput): string {
  const c = sceneBudgetBoardCard(input);
  return `bytes=${c.bytes} version=${c.version} avatars=${c.avatars} props=${c.props} within=${c.withinBudget}`;
}

/** L3 — parse status. */
export function parseSceneBudgetStatusLine(line: string): {
  readonly bytes: number;
  readonly version: number;
  readonly avatars: number;
  readonly props: number;
  readonly within: number;
} | null {
  const m = line.trim().match(/^bytes=(\d+) version=(\d+) avatars=(\d+) props=(\d+) within=([01])$/);
  if (!m) return null;
  return {
    bytes: Number(m[1]),
    version: Number(m[2]),
    avatars: Number(m[3]),
    props: Number(m[4]),
    within: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function sceneBudgetStatusLineMatches(input: SceneBudgetBoardInput): boolean {
  const p = parseSceneBudgetStatusLine(sceneBudgetStatusLine(input));
  if (!p) return false;
  const c = sceneBudgetBoardCard(input);
  return p.bytes === c.bytes && p.version === c.version && p.avatars === c.avatars && p.props === c.props && p.within === c.withinBudget;
}

/** L3 — within flag matches budget. */
export function sceneBudgetStatusLineConsistent(line: string): boolean {
  const p = parseSceneBudgetStatusLine(line);
  if (!p) return false;
  return p.within === (p.bytes <= SCENE_MAX_BYTES ? 1 : 0);
}

/** L3 — export header. */
export function sceneBudgetExportHeader(): string {
  return 'bytes,version,avatars,props,within';
}

/** L3 — export line. */
export function sceneBudgetExportLine(input: SceneBudgetBoardInput): string {
  const c = sceneBudgetBoardCard(input);
  return `${c.bytes},${c.version},${c.avatars},${c.props},${c.withinBudget}`;
}

/** L3 — full export. */
export function sceneBudgetExportText(input: SceneBudgetBoardInput): string {
  return [sceneBudgetExportHeader(), sceneBudgetExportLine(input)].join('\n');
}

/** L3 — within budget helper. */
export function sceneWithinBudget(byteSize: number): boolean {
  return byteSize <= SCENE_MAX_BYTES;
}
