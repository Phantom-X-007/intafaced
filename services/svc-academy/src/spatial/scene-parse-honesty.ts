/**
 * Academy L3 — pure scene parse refuse-reason honesty (no invent scene).
 *
 * Reasons: invalid | oversized.
 */

export const SCENE_PARSE_REFUSE_REASONS = ['invalid', 'oversized'] as const;
export type SceneParseRefuseReasonId = (typeof SCENE_PARSE_REFUSE_REASONS)[number];

export type SceneParseBoardInput =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SceneParseRefuseReasonId };

/** L3 — catalog board. */
export function sceneParseCatalogBoardCard(): {
  readonly reasons: number;
  readonly hasInvalid: number;
  readonly hasOversized: number;
} {
  return {
    reasons: SCENE_PARSE_REFUSE_REASONS.length,
    hasInvalid: SCENE_PARSE_REFUSE_REASONS.includes('invalid') ? 1 : 0,
    hasOversized: SCENE_PARSE_REFUSE_REASONS.includes('oversized') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function sceneParseCatalogStatusLine(): string {
  const c = sceneParseCatalogBoardCard();
  return `reasons=${c.reasons} invalid=${c.hasInvalid} oversized=${c.hasOversized}`;
}

/** L3 — parse catalog. */
export function parseSceneParseCatalogStatusLine(line: string): {
  readonly reasons: number;
  readonly invalid: number;
  readonly oversized: number;
} | null {
  const m = line.trim().match(/^reasons=(\d+) invalid=([01]) oversized=([01])$/);
  if (!m) return null;
  return {
    reasons: Number(m[1]),
    invalid: Number(m[2]),
    oversized: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function sceneParseCatalogStatusLineMatches(): boolean {
  const p = parseSceneParseCatalogStatusLine(sceneParseCatalogStatusLine());
  if (!p) return false;
  const c = sceneParseCatalogBoardCard();
  return (
    p.reasons === c.reasons && p.invalid === c.hasInvalid && p.oversized === c.hasOversized
  );
}

/** L3 — result board. */
export function sceneParseResultBoardCard(result: SceneParseBoardInput): {
  readonly ok: number;
  readonly reason: string;
} {
  if (result.ok) return { ok: 1, reason: '-' };
  return { ok: 0, reason: result.reason };
}

/** L3 — result status line. */
export function sceneParseResultStatusLine(result: SceneParseBoardInput): string {
  const c = sceneParseResultBoardCard(result);
  return `ok=${c.ok} reason=${c.reason}`;
}

/** L3 — parse result. */
export function parseSceneParseResultStatusLine(line: string): {
  readonly ok: number;
  readonly reason: string;
} | null {
  const m = line.trim().match(/^ok=([01]) reason=([a-z0-9_-]+)$/);
  if (!m) return null;
  return { ok: Number(m[1]), reason: m[2]! };
}

/** L3 — true when result matches. */
export function sceneParseResultStatusLineMatches(result: SceneParseBoardInput): boolean {
  const p = parseSceneParseResultStatusLine(sceneParseResultStatusLine(result));
  if (!p) return false;
  const c = sceneParseResultBoardCard(result);
  return p.ok === c.ok && p.reason === c.reason;
}

/** L3 — ok implies reason dash. */
export function sceneParseResultStatusLineConsistent(line: string): boolean {
  const p = parseSceneParseResultStatusLine(line);
  if (!p) return false;
  if (p.ok === 1) return p.reason === '-';
  return p.reason !== '-';
}

/** L3 — export header. */
export function sceneParseResultExportHeader(): string {
  return 'ok,reason';
}

/** L3 — export line. */
export function sceneParseResultExportLine(result: SceneParseBoardInput): string {
  const c = sceneParseResultBoardCard(result);
  return `${c.ok},${c.reason}`;
}

/** L3 — full export. */
export function sceneParseResultExportText(result: SceneParseBoardInput): string {
  return [sceneParseResultExportHeader(), sceneParseResultExportLine(result)].join('\n');
}

/** L3 — reason declared. */
export function isDeclaredSceneParseRefuseReason(reason: string): boolean {
  return (SCENE_PARSE_REFUSE_REASONS as readonly string[]).includes(reason);
}
