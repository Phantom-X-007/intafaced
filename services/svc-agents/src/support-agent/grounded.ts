/**
 * Support agent Stage-2 — grounded desk plane (L3 pack).
 *
 * When KB is empty or ticket plane is dark, refuse invent answers.
 * Money tools remain banned by Stage-1 guardrail.
 */

export type SupportDeskPlane = 'live' | 'dark';

export type SupportGrounded =
  | {
      readonly status: 'ok';
      readonly plane: 'live';
      readonly allowedTasks: readonly ['support.classify', 'support.reply'];
    }
  | {
      readonly status: 'refuse';
      readonly plane: 'dark';
      readonly reason: 'desk_plane_dark' | 'kb_empty';
      readonly userMessageKey: 'agents.support.unavailable';
    };

export function supportGrounded(input: { plane: SupportDeskPlane; kbHitCount?: number; requireKb?: boolean }): SupportGrounded {
  if (input.plane === 'dark') {
    return {
      status: 'refuse',
      plane: 'dark',
      reason: 'desk_plane_dark',
      userMessageKey: 'agents.support.unavailable',
    };
  }
  if (input.requireKb && (input.kbHitCount ?? 0) <= 0) {
    return {
      status: 'refuse',
      plane: 'dark',
      reason: 'kb_empty',
      userMessageKey: 'agents.support.unavailable',
    };
  }
  return {
    status: 'ok',
    plane: 'live',
    allowedTasks: ['support.classify', 'support.reply'],
  };
}

/** L3 — true when support grounded ok. */
export function isSupportGroundedOk(result: SupportGrounded): boolean {
  return result.status === 'ok';
}

/** L3 — board card. */
export function supportGroundedBoardCard(result: SupportGrounded): {
  readonly ok: boolean;
  readonly plane: SupportDeskPlane;
  readonly reason: string | null;
  readonly taskCount: number;
} {
  if (result.status === 'ok') {
    return { ok: true, plane: result.plane, reason: null, taskCount: result.allowedTasks.length };
  }
  return { ok: false, plane: result.plane, reason: result.reason, taskCount: 0 };
}

/** L3 — status line. */
export function supportGroundedStatusLine(result: SupportGrounded): string {
  const c = supportGroundedBoardCard(result);
  return `ok=${c.ok ? '1' : '0'} plane=${c.plane} tasks=${c.taskCount} reason=${c.reason ?? '-'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseSupportGroundedStatusLine(
  line: string,
): { readonly ok: boolean; readonly plane: SupportDeskPlane; readonly tasks: number; readonly reason: string | null } | null {
  const m = line.trim().match(/^ok=([01]) plane=(live|dark) tasks=(\d+) reason=(\S+)$/);
  if (!m) return null;
  return {
    ok: m[1] === '1',
    plane: m[2] as SupportDeskPlane,
    tasks: Number(m[3]),
    reason: m[4] === '-' ? null : m[4]!,
  };
}

/** L3 — true when status matches. */
export function supportGroundedStatusLineMatches(result: SupportGrounded): boolean {
  const p = parseSupportGroundedStatusLine(supportGroundedStatusLine(result));
  if (!p) return false;
  const c = supportGroundedBoardCard(result);
  return p.ok === c.ok && p.plane === c.plane && p.tasks === c.taskCount && p.reason === c.reason;
}

/** L3 — export header. */
export function supportGroundedExportHeader(): string {
  return 'status,plane,tasks,reason';
}

/** L3 — export line. */
export function supportGroundedExportLine(result: SupportGrounded): string {
  const c = supportGroundedBoardCard(result);
  return `${c.ok ? 'ok' : 'refuse'},${c.plane},${c.taskCount},${c.reason ?? ''}`;
}

/** L3 — full export. */
export function supportGroundedExportText(result: SupportGrounded): string {
  return [supportGroundedExportHeader(), supportGroundedExportLine(result)].join('\n');
}
