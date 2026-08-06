/**
 * Agents L3 — pure navigator tool_select result honesty boards (no I/O).
 *
 * Shapes mirror tool-select.ts ToolSelectResult. Never invents tools.
 */

export type ToolSelectRefuseReason = 'not_declared' | 'money_write' | 'write_mode';

export type ToolSelectResultInput =
  | {
      readonly status: 'ok';
      readonly selected: readonly string[];
      readonly refused: readonly { readonly tool: string; readonly reason: ToolSelectRefuseReason }[];
    }
  | { readonly status: 'refuse'; readonly reason: 'trade_plane_dark' | 'no_candidates' };

/** L3 — board card. */
export function toolSelectBoardCard(result: ToolSelectResultInput): {
  readonly status: string;
  readonly selected: number;
  readonly refused: number;
  readonly moneyWrite: number;
  readonly notDeclared: number;
  readonly writeMode: number;
  readonly reason: string;
} {
  if (result.status === 'refuse') {
    return {
      status: 'refuse',
      selected: 0,
      refused: 0,
      moneyWrite: 0,
      notDeclared: 0,
      writeMode: 0,
      reason: result.reason,
    };
  }
  let moneyWrite = 0;
  let notDeclared = 0;
  let writeMode = 0;
  for (const r of result.refused) {
    if (r.reason === 'money_write') moneyWrite += 1;
    else if (r.reason === 'not_declared') notDeclared += 1;
    else writeMode += 1;
  }
  return {
    status: 'ok',
    selected: result.selected.length,
    refused: result.refused.length,
    moneyWrite,
    notDeclared,
    writeMode,
    reason: '-',
  };
}

/** L3 — status line. */
export function toolSelectStatusLine(result: ToolSelectResultInput): string {
  const c = toolSelectBoardCard(result);
  return `status=${c.status} selected=${c.selected} refused=${c.refused} money_write=${c.moneyWrite} not_declared=${c.notDeclared} write_mode=${c.writeMode} reason=${c.reason}`;
}

/** L3 — parse status. */
export function parseToolSelectStatusLine(line: string): {
  readonly status: string;
  readonly selected: number;
  readonly refused: number;
  readonly moneyWrite: number;
  readonly notDeclared: number;
  readonly writeMode: number;
  readonly reason: string;
} | null {
  const m = line
    .trim()
    .match(/^status=(ok|refuse) selected=(\d+) refused=(\d+) money_write=(\d+) not_declared=(\d+) write_mode=(\d+) reason=([a-z0-9_-]+)$/);
  if (!m) return null;
  return {
    status: m[1]!,
    selected: Number(m[2]),
    refused: Number(m[3]),
    moneyWrite: Number(m[4]),
    notDeclared: Number(m[5]),
    writeMode: Number(m[6]),
    reason: m[7]!,
  };
}

/** L3 — true when status matches. */
export function toolSelectStatusLineMatches(result: ToolSelectResultInput): boolean {
  const p = parseToolSelectStatusLine(toolSelectStatusLine(result));
  if (!p) return false;
  const c = toolSelectBoardCard(result);
  return (
    p.status === c.status &&
    p.selected === c.selected &&
    p.refused === c.refused &&
    p.moneyWrite === c.moneyWrite &&
    p.notDeclared === c.notDeclared &&
    p.writeMode === c.writeMode &&
    p.reason === c.reason
  );
}

/** L3 — true when refuse splits sum to refused; refuse status has zero selected. */
export function toolSelectStatusLineConsistent(line: string): boolean {
  const p = parseToolSelectStatusLine(line);
  if (!p) return false;
  if (p.status === 'refuse') return p.selected === 0 && p.refused === 0;
  return p.refused === p.moneyWrite + p.notDeclared + p.writeMode;
}

/** L3 — export header. */
export function toolSelectExportHeader(): string {
  return 'status,selected,refused,money_write,not_declared,write_mode,reason';
}

/** L3 — export line. */
export function toolSelectExportLine(result: ToolSelectResultInput): string {
  const c = toolSelectBoardCard(result);
  return `${c.status},${c.selected},${c.refused},${c.moneyWrite},${c.notDeclared},${c.writeMode},${c.reason}`;
}

/** L3 — full export. */
export function toolSelectExportText(result: ToolSelectResultInput): string {
  return [toolSelectExportHeader(), toolSelectExportLine(result)].join('\n');
}

/** L3 — true when no money_write refuses on ok (or refuse status). */
export function toolSelectHasNoMoneyWriteRefuse(result: ToolSelectResultInput): boolean {
  return toolSelectBoardCard(result).moneyWrite === 0;
}

/** L3 — selected count in range. */
export function toolSelectSelectedInRange(result: ToolSelectResultInput, min: number, max: number): boolean {
  if (min > max) return false;
  const n = toolSelectBoardCard(result).selected;
  return n >= min && n <= max;
}
