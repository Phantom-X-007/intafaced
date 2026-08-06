/**
 * Agents L3 — pure support desk grounded honesty boards (no KB I/O).
 *
 * Shapes mirror grounded.ts SupportGrounded. Dark/kb_empty never invents.
 */

export type SupportGroundedInput =
  | {
      readonly status: 'ok';
      readonly plane: 'live';
      readonly allowedTasks: readonly string[];
    }
  | {
      readonly status: 'refuse';
      readonly plane: 'dark';
      readonly reason: 'desk_plane_dark' | 'kb_empty';
    };

/** L3 — board card. */
export function supportGroundedBoardCard(result: SupportGroundedInput): {
  readonly status: string;
  readonly plane: string;
  readonly tasks: number;
  readonly reason: string;
} {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      plane: 'live',
      tasks: result.allowedTasks.length,
      reason: '-',
    };
  }
  return {
    status: 'refuse',
    plane: 'dark',
    tasks: 0,
    reason: result.reason,
  };
}

/** L3 — status line. */
export function supportGroundedStatusLine(result: SupportGroundedInput): string {
  const c = supportGroundedBoardCard(result);
  return `status=${c.status} plane=${c.plane} tasks=${c.tasks} reason=${c.reason}`;
}

/** L3 — parse status. */
export function parseSupportGroundedStatusLine(line: string): {
  readonly status: string;
  readonly plane: string;
  readonly tasks: number;
  readonly reason: string;
} | null {
  const m = line.trim().match(/^status=(ok|refuse) plane=(live|dark) tasks=(\d+) reason=([a-z0-9_-]+)$/);
  if (!m) return null;
  return {
    status: m[1]!,
    plane: m[2]!,
    tasks: Number(m[3]),
    reason: m[4]!,
  };
}

/** L3 — true when status matches. */
export function supportGroundedStatusLineMatches(result: SupportGroundedInput): boolean {
  const p = parseSupportGroundedStatusLine(supportGroundedStatusLine(result));
  if (!p) return false;
  const c = supportGroundedBoardCard(result);
  return p.status === c.status && p.plane === c.plane && p.tasks === c.tasks && p.reason === c.reason;
}

/** L3 — dark implies refuse and zero tasks. */
export function supportGroundedStatusLineConsistent(line: string): boolean {
  const p = parseSupportGroundedStatusLine(line);
  if (!p) return false;
  if (p.plane === 'dark') return p.status === 'refuse' && p.tasks === 0;
  return p.status === 'ok' && p.reason === '-';
}

/** L3 — export header. */
export function supportGroundedExportHeader(): string {
  return 'status,plane,tasks,reason';
}

/** L3 — export line. */
export function supportGroundedExportLine(result: SupportGroundedInput): string {
  const c = supportGroundedBoardCard(result);
  return `${c.status},${c.plane},${c.tasks},${c.reason}`;
}

/** L3 — full export. */
export function supportGroundedExportText(result: SupportGroundedInput): string {
  return [supportGroundedExportHeader(), supportGroundedExportLine(result)].join('\n');
}

/** L3 — live desk fixture. */
export function liveSupportGrounded(): SupportGroundedInput {
  return {
    status: 'ok',
    plane: 'live',
    allowedTasks: ['support.classify', 'support.reply'],
  };
}

/** L3 — dark desk fixture. */
export function darkSupportGrounded(): SupportGroundedInput {
  return { status: 'refuse', plane: 'dark', reason: 'desk_plane_dark' };
}

/** L3 — empty KB fixture. */
export function emptyKbSupportGrounded(): SupportGroundedInput {
  return { status: 'refuse', plane: 'dark', reason: 'kb_empty' };
}
