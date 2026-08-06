/**
 * Notify L3 — pure SMS compose honesty boards (no gateway I/O).
 *
 * Works on already-composed SMS text + budget. Does not invent messages.
 * composeSms / truncate stay the SoT for cutting rules.
 */

/** L3 — board card for composed SMS vs budget. */
export function smsComposeBoardCard(
  text: string,
  maxChars: number,
): {
  readonly length: number;
  readonly maxChars: number;
  readonly withinBudget: boolean;
  readonly empty: boolean;
  readonly truncated: boolean;
} {
  const max = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  const length = text.length;
  return {
    length,
    maxChars: max,
    withinBudget: length <= max,
    empty: length === 0,
    // ellipsis marker used by truncate() when cut
    truncated: text.includes('…') || text.includes('...'),
  };
}

/** L3 — status line. */
export function smsComposeStatusLine(text: string, maxChars: number): string {
  const c = smsComposeBoardCard(text, maxChars);
  return `len=${c.length} max=${c.maxChars} ok=${c.withinBudget ? '1' : '0'} empty=${c.empty ? '1' : '0'} cut=${c.truncated ? '1' : '0'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseSmsComposeStatusLine(
  line: string,
): { readonly len: number; readonly max: number; readonly ok: boolean; readonly empty: boolean; readonly cut: boolean } | null {
  const m = line.trim().match(/^len=(\d+) max=(\d+) ok=([01]) empty=([01]) cut=([01])$/);
  if (!m) return null;
  return {
    len: Number(m[1]),
    max: Number(m[2]),
    ok: m[3] === '1',
    empty: m[4] === '1',
    cut: m[5] === '1',
  };
}

/** L3 — true when status matches. */
export function smsComposeStatusLineMatches(text: string, maxChars: number): boolean {
  const p = parseSmsComposeStatusLine(smsComposeStatusLine(text, maxChars));
  if (!p) return false;
  const c = smsComposeBoardCard(text, maxChars);
  return p.len === c.length && p.max === c.maxChars && p.ok === c.withinBudget && p.empty === c.empty && p.cut === c.truncated;
}

/** L3 — true when ok implies len<=max and empty implies len=0. */
export function smsComposeStatusLineConsistent(line: string): boolean {
  const p = parseSmsComposeStatusLine(line);
  if (!p) return false;
  return p.ok === p.len <= p.max && p.empty === (p.len === 0);
}

/** L3 — export header. */
export function smsComposeExportHeader(): string {
  return 'length,maxChars,withinBudget,truncated';
}

/** L3 — export line. */
export function smsComposeExportLine(text: string, maxChars: number): string {
  const c = smsComposeBoardCard(text, maxChars);
  return `${c.length},${c.maxChars},${c.withinBudget ? '1' : '0'},${c.truncated ? '1' : '0'}`;
}

/** L3 — full export. */
export function smsComposeExportText(text: string, maxChars: number): string {
  return [smsComposeExportHeader(), smsComposeExportLine(text, maxChars)].join('\n');
}

/** L3 — true when length is within [min,max]. Invalid → false. */
export function smsLengthInRange(text: string, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = text.length;
  return n >= min && n <= max;
}

/** L3 — true when text fits budget. Invalid budget → false. */
export function smsWithinBudget(text: string, maxChars: number): boolean {
  if (!Number.isFinite(maxChars) || maxChars < 0) return false;
  return text.length <= Math.floor(maxChars);
}
