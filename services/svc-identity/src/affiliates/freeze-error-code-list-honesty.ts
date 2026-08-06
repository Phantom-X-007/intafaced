/**
 * Identity L3 — pure freeze reason assert honesty (non-empty reason law).
 *
 * Complements freeze-error-honesty: structural reason gate only.
 */

/** L3 — pure assert: non-empty trimmed reason required. */
export function freezeReasonOk(reason: string | null | undefined): boolean {
  return (reason ?? '').trim().length > 0;
}

/** L3 — board. */
export function freezeReasonGateBoardCard(reason: string | null | undefined): {
  readonly length: number;
  readonly ok: number;
  readonly refuse: number;
} {
  const length = (reason ?? '').trim().length;
  return {
    length,
    ok: length > 0 ? 1 : 0,
    refuse: length > 0 ? 0 : 1,
  };
}

/** L3 — status line. */
export function freezeReasonGateStatusLine(reason: string | null | undefined): string {
  const c = freezeReasonGateBoardCard(reason);
  return `length=${c.length} ok=${c.ok} refuse=${c.refuse}`;
}

/** L3 — parse status. */
export function parseFreezeReasonGateStatusLine(line: string): {
  readonly length: number;
  readonly ok: number;
  readonly refuse: number;
} | null {
  const m = line.trim().match(/^length=(\d+) ok=([01]) refuse=([01])$/);
  if (!m) return null;
  return { length: Number(m[1]), ok: Number(m[2]), refuse: Number(m[3]) };
}

/** L3 — true when status matches. */
export function freezeReasonGateStatusLineMatches(reason: string | null | undefined): boolean {
  const p = parseFreezeReasonGateStatusLine(freezeReasonGateStatusLine(reason));
  if (!p) return false;
  const c = freezeReasonGateBoardCard(reason);
  return p.length === c.length && p.ok === c.ok && p.refuse === c.refuse;
}

/** L3 — ok XOR refuse. */
export function freezeReasonGateStatusLineConsistent(line: string): boolean {
  const p = parseFreezeReasonGateStatusLine(line);
  if (!p) return false;
  return p.ok + p.refuse === 1 && p.refuse === (p.length === 0 ? 1 : 0);
}

/** L3 — export header. */
export function freezeReasonGateExportHeader(): string {
  return 'length,ok,refuse';
}

/** L3 — export line. */
export function freezeReasonGateExportLine(reason: string | null | undefined): string {
  const c = freezeReasonGateBoardCard(reason);
  return `${c.length},${c.ok},${c.refuse}`;
}

/** L3 — full export. */
export function freezeReasonGateExportText(reason: string | null | undefined): string {
  return [freezeReasonGateExportHeader(), freezeReasonGateExportLine(reason)].join('\n');
}
