/**
 * Contracts L3 — pure card share-mode catalog honesty.
 *
 * Mirrors blueprint.ts cardRenderSchema shareMode: svg | png.
 * Does not invent renderer product law.
 */

export const SHARE_MODES = ['svg', 'png'] as const;
export type ShareModeId = (typeof SHARE_MODES)[number];

/** L3 — catalog board. */
export function shareModeCatalogBoardCard(): {
  readonly modes: number;
  readonly hasSvg: number;
  readonly hasPng: number;
} {
  return {
    modes: SHARE_MODES.length,
    hasSvg: SHARE_MODES.includes('svg') ? 1 : 0,
    hasPng: SHARE_MODES.includes('png') ? 1 : 0,
  };
}

/** L3 — status line. */
export function shareModeCatalogStatusLine(): string {
  const c = shareModeCatalogBoardCard();
  return `modes=${c.modes} svg=${c.hasSvg} png=${c.hasPng}`;
}

/** L3 — parse status. */
export function parseShareModeCatalogStatusLine(line: string): {
  readonly modes: number;
  readonly svg: number;
  readonly png: number;
} | null {
  const m = line.trim().match(/^modes=(\d+) svg=([01]) png=([01])$/);
  if (!m) return null;
  return { modes: Number(m[1]), svg: Number(m[2]), png: Number(m[3]) };
}

/** L3 — true when status matches. */
export function shareModeCatalogStatusLineMatches(): boolean {
  const p = parseShareModeCatalogStatusLine(shareModeCatalogStatusLine());
  if (!p) return false;
  const c = shareModeCatalogBoardCard();
  return p.modes === c.modes && p.svg === c.hasSvg && p.png === c.hasPng;
}

/** L3 — two modes. */
export function shareModeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseShareModeCatalogStatusLine(line);
  if (!p) return false;
  return p.modes === 2 && p.svg === 1 && p.png === 1;
}

/** L3 — export header. */
export function shareModeCatalogExportHeader(): string {
  return 'mode';
}

/** L3 — export lines. */
export function shareModeCatalogExportLines(): readonly string[] {
  return [...SHARE_MODES];
}

/** L3 — full export. */
export function shareModeCatalogExportText(): string {
  return [shareModeCatalogExportHeader(), ...shareModeCatalogExportLines()].join('\n');
}

/** L3 — mode declared. */
export function isDeclaredShareMode(mode: string): boolean {
  return (SHARE_MODES as readonly string[]).includes(mode);
}
