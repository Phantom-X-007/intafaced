/**
 * Agents L3 — pure tool mode catalog honesty (no runtime I/O).
 *
 * Mirrors guardrails.ts TOOL_MODES.
 */

export const TOOL_MODES = ['read', 'write'] as const;
export type ToolModeId = (typeof TOOL_MODES)[number];

export type ToolGrantBoardInput = {
  readonly name: string;
  readonly mode: ToolModeId;
};

/** L3 — catalog board. */
export function toolModeCatalogBoardCard(): {
  readonly modes: number;
  readonly hasRead: number;
  readonly hasWrite: number;
} {
  return {
    modes: TOOL_MODES.length,
    hasRead: TOOL_MODES.includes('read') ? 1 : 0,
    hasWrite: TOOL_MODES.includes('write') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function toolModeCatalogStatusLine(): string {
  const c = toolModeCatalogBoardCard();
  return `modes=${c.modes} read=${c.hasRead} write=${c.hasWrite}`;
}

/** L3 — parse catalog. */
export function parseToolModeCatalogStatusLine(line: string): {
  readonly modes: number;
  readonly read: number;
  readonly write: number;
} | null {
  const m = line.trim().match(/^modes=(\d+) read=([01]) write=([01])$/);
  if (!m) return null;
  return { modes: Number(m[1]), read: Number(m[2]), write: Number(m[3]) };
}

/** L3 — true when catalog matches. */
export function toolModeCatalogStatusLineMatches(): boolean {
  const p = parseToolModeCatalogStatusLine(toolModeCatalogStatusLine());
  if (!p) return false;
  const c = toolModeCatalogBoardCard();
  return p.modes === c.modes && p.read === c.hasRead && p.write === c.hasWrite;
}

/** L3 — two modes. */
export function toolModeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseToolModeCatalogStatusLine(line);
  if (!p) return false;
  return p.modes === 2 && p.read === 1 && p.write === 1;
}

/** L3 — grant list board. */
export function toolGrantListBoardCard(grants: readonly ToolGrantBoardInput[]): {
  readonly tools: number;
  readonly read: number;
  readonly write: number;
} {
  let read = 0;
  let write = 0;
  for (const g of grants) {
    if (g.mode === 'read') read += 1;
    else write += 1;
  }
  return { tools: grants.length, read, write };
}

/** L3 — grant list status line. */
export function toolGrantListStatusLine(grants: readonly ToolGrantBoardInput[]): string {
  const c = toolGrantListBoardCard(grants);
  return `tools=${c.tools} read=${c.read} write=${c.write}`;
}

/** L3 — parse grant list. */
export function parseToolGrantListStatusLine(line: string): {
  readonly tools: number;
  readonly read: number;
  readonly write: number;
} | null {
  const m = line.trim().match(/^tools=(\d+) read=(\d+) write=(\d+)$/);
  if (!m) return null;
  return { tools: Number(m[1]), read: Number(m[2]), write: Number(m[3]) };
}

/** L3 — true when grant list matches. */
export function toolGrantListStatusLineMatches(grants: readonly ToolGrantBoardInput[]): boolean {
  const p = parseToolGrantListStatusLine(toolGrantListStatusLine(grants));
  if (!p) return false;
  const c = toolGrantListBoardCard(grants);
  return p.tools === c.tools && p.read === c.read && p.write === c.write;
}

/** L3 — read+write equals tools. */
export function toolGrantListStatusLineConsistent(line: string): boolean {
  const p = parseToolGrantListStatusLine(line);
  if (!p) return false;
  return p.tools === p.read + p.write;
}

/** L3 — export header. */
export function toolGrantListExportHeader(): string {
  return 'tools,read,write';
}

/** L3 — export line. */
export function toolGrantListExportLine(grants: readonly ToolGrantBoardInput[]): string {
  const c = toolGrantListBoardCard(grants);
  return `${c.tools},${c.read},${c.write}`;
}

/** L3 — full export. */
export function toolGrantListExportText(grants: readonly ToolGrantBoardInput[]): string {
  return [toolGrantListExportHeader(), toolGrantListExportLine(grants)].join('\n');
}

/** L3 — mode declared. */
export function isDeclaredToolMode(mode: string): boolean {
  return (TOOL_MODES as readonly string[]).includes(mode);
}
