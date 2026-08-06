/**
 * Agents L3 — pure support comment draft honesty boards (no ticket I/O).
 *
 * Shapes mirror comment-draft.ts CommentDraftResult. Never invents refunds.
 */

export type CommentDraftResultInput =
  | { readonly status: 'ok'; readonly ticketId: string; readonly body: string }
  | {
      readonly status: 'refuse';
      readonly reason: 'missing_ticket' | 'empty_body' | 'body_too_long' | 'money_invent_language';
    };

/** L3 — board card. */
export function commentDraftBoardCard(result: CommentDraftResultInput): {
  readonly status: string;
  readonly bodyLen: number;
  readonly reason: string;
  readonly moneyRefuse: number;
} {
  if (result.status === 'ok') {
    return {
      status: 'ok',
      bodyLen: result.body.length,
      reason: '-',
      moneyRefuse: 0,
    };
  }
  return {
    status: 'refuse',
    bodyLen: 0,
    reason: result.reason,
    moneyRefuse: result.reason === 'money_invent_language' ? 1 : 0,
  };
}

/** L3 — status line. */
export function commentDraftStatusLine(result: CommentDraftResultInput): string {
  const c = commentDraftBoardCard(result);
  return `status=${c.status} body_len=${c.bodyLen} reason=${c.reason} money_refuse=${c.moneyRefuse}`;
}

/** L3 — parse status. */
export function parseCommentDraftStatusLine(line: string): {
  readonly status: string;
  readonly bodyLen: number;
  readonly reason: string;
  readonly moneyRefuse: number;
} | null {
  const m = line.trim().match(/^status=(ok|refuse) body_len=(\d+) reason=([a-z0-9_-]+) money_refuse=([01])$/);
  if (!m) return null;
  return {
    status: m[1]!,
    bodyLen: Number(m[2]),
    reason: m[3]!,
    moneyRefuse: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function commentDraftStatusLineMatches(result: CommentDraftResultInput): boolean {
  const p = parseCommentDraftStatusLine(commentDraftStatusLine(result));
  if (!p) return false;
  const c = commentDraftBoardCard(result);
  return p.status === c.status && p.bodyLen === c.bodyLen && p.reason === c.reason && p.moneyRefuse === c.moneyRefuse;
}

/** L3 — refuse has body_len 0; money_refuse only with money reason. */
export function commentDraftStatusLineConsistent(line: string): boolean {
  const p = parseCommentDraftStatusLine(line);
  if (!p) return false;
  if (p.status === 'ok') return p.reason === '-' && p.moneyRefuse === 0;
  return p.bodyLen === 0 && p.moneyRefuse === (p.reason === 'money_invent_language' ? 1 : 0);
}

/** L3 — export header. */
export function commentDraftExportHeader(): string {
  return 'status,body_len,reason,money_refuse';
}

/** L3 — export line. */
export function commentDraftExportLine(result: CommentDraftResultInput): string {
  const c = commentDraftBoardCard(result);
  return `${c.status},${c.bodyLen},${c.reason},${c.moneyRefuse}`;
}

/** L3 — full export. */
export function commentDraftExportText(result: CommentDraftResultInput): string {
  return [commentDraftExportHeader(), commentDraftExportLine(result)].join('\n');
}

/** L3 — true when money invent refused. */
export function commentDraftIsMoneyRefuse(result: CommentDraftResultInput): boolean {
  return commentDraftBoardCard(result).moneyRefuse === 1;
}

/** L3 — body length in range (ok only). */
export function commentDraftBodyLenInRange(result: CommentDraftResultInput, min: number, max: number): boolean {
  if (min > max) return false;
  const n = commentDraftBoardCard(result).bodyLen;
  return n >= min && n <= max;
}
