/**
 * Identity L3 — pure referral depth policy honesty boards (no tree I/O).
 *
 * Mirrors referral-tree.ts DEFAULT_MAX_REFERRAL_DEPTH. Does not invent edges.
 */

export const DEFAULT_MAX_REFERRAL_DEPTH = 5;

export type ReferralDepthBoardInput = {
  readonly depth: number;
  readonly maxDepth?: number;
};

/** L3 — catalog board. */
export function referralDepthCatalogBoardCard(): {
  readonly defaultMaxDepth: number;
  readonly minDepth: number;
} {
  return { defaultMaxDepth: DEFAULT_MAX_REFERRAL_DEPTH, minDepth: 0 };
}

/** L3 — catalog status line. */
export function referralDepthCatalogStatusLine(): string {
  const c = referralDepthCatalogBoardCard();
  return `default_max=${c.defaultMaxDepth} min=${c.minDepth}`;
}

/** L3 — parse catalog. */
export function parseReferralDepthCatalogStatusLine(
  line: string,
): { readonly defaultMax: number; readonly min: number } | null {
  const m = line.trim().match(/^default_max=(\d+) min=(\d+)$/);
  if (!m) return null;
  return { defaultMax: Number(m[1]), min: Number(m[2]) };
}

/** L3 — true when catalog matches. */
export function referralDepthCatalogStatusLineMatches(): boolean {
  const p = parseReferralDepthCatalogStatusLine(referralDepthCatalogStatusLine());
  if (!p) return false;
  const c = referralDepthCatalogBoardCard();
  return p.defaultMax === c.defaultMaxDepth && p.min === c.minDepth;
}

/** L3 — depth observation board. */
export function referralDepthBoardCard(input: ReferralDepthBoardInput): {
  readonly depth: number;
  readonly maxDepth: number;
  readonly withinCap: number;
  readonly overCap: number;
} {
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_REFERRAL_DEPTH;
  const within = input.depth >= 0 && input.depth <= maxDepth;
  return {
    depth: input.depth,
    maxDepth,
    withinCap: within ? 1 : 0,
    overCap: within ? 0 : 1,
  };
}

/** L3 — status line. */
export function referralDepthStatusLine(input: ReferralDepthBoardInput): string {
  const c = referralDepthBoardCard(input);
  return `depth=${c.depth} max=${c.maxDepth} within=${c.withinCap} over=${c.overCap}`;
}

/** L3 — parse status. */
export function parseReferralDepthStatusLine(line: string): {
  readonly depth: number;
  readonly max: number;
  readonly within: number;
  readonly over: number;
} | null {
  const m = line.trim().match(/^depth=(-?\d+) max=(\d+) within=([01]) over=([01])$/);
  if (!m) return null;
  return {
    depth: Number(m[1]),
    max: Number(m[2]),
    within: Number(m[3]),
    over: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function referralDepthStatusLineMatches(input: ReferralDepthBoardInput): boolean {
  const p = parseReferralDepthStatusLine(referralDepthStatusLine(input));
  if (!p) return false;
  const c = referralDepthBoardCard(input);
  return (
    p.depth === c.depth &&
    p.max === c.maxDepth &&
    p.within === c.withinCap &&
    p.over === c.overCap
  );
}

/** L3 — within XOR over. */
export function referralDepthStatusLineConsistent(line: string): boolean {
  const p = parseReferralDepthStatusLine(line);
  if (!p) return false;
  return p.within + p.over === 1;
}

/** L3 — export header. */
export function referralDepthExportHeader(): string {
  return 'depth,max,within,over';
}

/** L3 — export line. */
export function referralDepthExportLine(input: ReferralDepthBoardInput): string {
  const c = referralDepthBoardCard(input);
  return `${c.depth},${c.maxDepth},${c.withinCap},${c.overCap}`;
}

/** L3 — full export. */
export function referralDepthExportText(input: ReferralDepthBoardInput): string {
  return [referralDepthExportHeader(), referralDepthExportLine(input)].join('\n');
}

/** L3 — depth in range. */
export function referralDepthInRange(input: ReferralDepthBoardInput, min: number, max: number): boolean {
  if (min > max) return false;
  return input.depth >= min && input.depth <= max;
}
