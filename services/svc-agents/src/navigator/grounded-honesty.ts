/**
 * Agents L3 — pure navigator grounded plane honesty boards (no trade I/O).
 *
 * Shapes mirror grounded.ts GroundedResult. Dark never invents markets.
 */

export type GroundedResultInput =
  | {
      readonly status: 'ok';
      readonly plane: 'live';
      readonly allowedTasks: readonly string[];
    }
  | {
      readonly status: 'refuse';
      readonly plane: 'dark';
      readonly reason: 'trade_plane_dark';
    };

/** L3 — board card. */
export function groundedBoardCard(result: GroundedResultInput): {
  readonly status: string;
  readonly plane: string;
  readonly tasks: number;
  readonly dark: number;
} {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      plane: 'live',
      tasks: result.allowedTasks.length,
      dark: 0,
    };
  }
  return { status: 'refuse', plane: 'dark', tasks: 0, dark: 1 };
}

/** L3 — status line. */
export function groundedStatusLine(result: GroundedResultInput): string {
  const c = groundedBoardCard(result);
  return `status=${c.status} plane=${c.plane} tasks=${c.tasks} dark=${c.dark}`;
}

/** L3 — parse status. */
export function parseGroundedStatusLine(line: string): {
  readonly status: string;
  readonly plane: string;
  readonly tasks: number;
  readonly dark: number;
} | null {
  const m = line
    .trim()
    .match(/^status=(ok|refuse) plane=(live|dark) tasks=(\d+) dark=([01])$/);
  if (!m) return null;
  return {
    status: m[1]!,
    plane: m[2]!,
    tasks: Number(m[3]),
    dark: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function groundedStatusLineMatches(result: GroundedResultInput): boolean {
  const p = parseGroundedStatusLine(groundedStatusLine(result));
  if (!p) return false;
  const c = groundedBoardCard(result);
  return (
    p.status === c.status &&
    p.plane === c.plane &&
    p.tasks === c.tasks &&
    p.dark === c.dark
  );
}

/** L3 — dark implies refuse and zero tasks. */
export function groundedStatusLineConsistent(line: string): boolean {
  const p = parseGroundedStatusLine(line);
  if (!p) return false;
  if (p.plane === 'dark') return p.status === 'refuse' && p.tasks === 0 && p.dark === 1;
  return p.status === 'ok' && p.dark === 0;
}

/** L3 — export header. */
export function groundedExportHeader(): string {
  return 'status,plane,tasks,dark';
}

/** L3 — export line. */
export function groundedExportLine(result: GroundedResultInput): string {
  const c = groundedBoardCard(result);
  return `${c.status},${c.plane},${c.tasks},${c.dark}`;
}

/** L3 — full export. */
export function groundedExportText(result: GroundedResultInput): string {
  return [groundedExportHeader(), groundedExportLine(result)].join('\n');
}

/** L3 — live plane board. */
export function liveGroundedResult(): GroundedResultInput {
  return {
    status: 'ok',
    plane: 'live',
    allowedTasks: ['navigator.plan', 'navigator.tool_select'],
  };
}

/** L3 — dark plane board. */
export function darkGroundedResult(): GroundedResultInput {
  return { status: 'refuse', plane: 'dark', reason: 'trade_plane_dark' };
}

/** L3 — task count in range. */
export function groundedTaskCountInRange(
  result: GroundedResultInput,
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = groundedBoardCard(result).tasks;
  return n >= min && n <= max;
}
