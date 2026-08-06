/**
 * Notify L3 — pure rendered-copy honesty boards (no i18n runtime).
 *
 * Separated from render.ts so operator boards can be tested without loading
 * @intafaced/i18n catalogs. Shape matches RenderedCopy.
 */

export type RenderedCopyBoardInput = {
  readonly title: string;
  readonly body: string;
};

/** L3 — rendered copy board card. */
export function renderedCopyBoardCard(copy: RenderedCopyBoardInput): {
  readonly titleLen: number;
  readonly bodyLen: number;
  readonly emptyTitle: boolean;
  readonly emptyBody: boolean;
} {
  return {
    titleLen: copy.title.length,
    bodyLen: copy.body.length,
    emptyTitle: copy.title.length === 0,
    emptyBody: copy.body.length === 0,
  };
}

/** L3 — status line. */
export function renderedCopyStatusLine(copy: RenderedCopyBoardInput): string {
  const c = renderedCopyBoardCard(copy);
  return `titleLen=${c.titleLen} bodyLen=${c.bodyLen} emptyTitle=${c.emptyTitle ? '1' : '0'} emptyBody=${c.emptyBody ? '1' : '0'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseRenderedCopyStatusLine(
  line: string,
): { readonly titleLen: number; readonly bodyLen: number; readonly emptyTitle: boolean; readonly emptyBody: boolean } | null {
  const m = line.trim().match(/^titleLen=(\d+) bodyLen=(\d+) emptyTitle=([01]) emptyBody=([01])$/);
  if (!m) return null;
  return {
    titleLen: Number(m[1]),
    bodyLen: Number(m[2]),
    emptyTitle: m[3] === '1',
    emptyBody: m[4] === '1',
  };
}

/** L3 — true when status matches. */
export function renderedCopyStatusLineMatches(copy: RenderedCopyBoardInput): boolean {
  const p = parseRenderedCopyStatusLine(renderedCopyStatusLine(copy));
  if (!p) return false;
  const c = renderedCopyBoardCard(copy);
  return p.titleLen === c.titleLen && p.bodyLen === c.bodyLen && p.emptyTitle === c.emptyTitle && p.emptyBody === c.emptyBody;
}

/** L3 — true when lengths consistent with empty flags. */
export function renderedCopyStatusLineConsistent(line: string): boolean {
  const p = parseRenderedCopyStatusLine(line);
  if (!p) return false;
  return p.emptyTitle === (p.titleLen === 0) && p.emptyBody === (p.bodyLen === 0);
}

/** L3 — export header. */
export function renderedCopyExportHeader(): string {
  return 'titleLen,bodyLen';
}

/** L3 — export line. */
export function renderedCopyExportLine(copy: RenderedCopyBoardInput): string {
  const c = renderedCopyBoardCard(copy);
  return `${c.titleLen},${c.bodyLen}`;
}

/** L3 — full export. */
export function renderedCopyExportText(copy: RenderedCopyBoardInput): string {
  return [renderedCopyExportHeader(), renderedCopyExportLine(copy)].join('\n');
}

/** L3 — true when bodyLen is at least n. Invalid → false. */
export function renderedBodyLenAtLeast(copy: RenderedCopyBoardInput, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return copy.body.length >= n;
}
