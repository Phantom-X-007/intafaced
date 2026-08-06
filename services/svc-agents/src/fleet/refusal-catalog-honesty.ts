/**
 * Agents L3 — pure guardrail refusal catalog honesty boards (no runtime I/O).
 *
 * Mirrors guardrails.ts REFUSAL_CODES. Does not invent new codes.
 */

export const REFUSAL_CODE_CATALOG = [
  'agents.tool_not_declared',
  'agents.tool_call_limit',
  'agents.module_not_allowed',
  'agents.task_not_allowed',
  'agents.action_limit',
  'agents.spend_limit',
  'agents.output_limit',
  'agents.approval_required',
  'agents.session_closed',
] as const;

export type RefusalCodeId = (typeof REFUSAL_CODE_CATALOG)[number];

export type RefusalEventInput = {
  readonly code: RefusalCodeId;
};

/** L3 — catalog size. */
export function refusalCatalogSize(): number {
  return REFUSAL_CODE_CATALOG.length;
}

/** L3 — true when code is declared. */
export function isDeclaredRefusalCode(code: string): boolean {
  return (REFUSAL_CODE_CATALOG as readonly string[]).includes(code);
}

/** L3 — histogram of refusal events. */
export function refusalEventHistogram(events: readonly RefusalEventInput[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.code] = (out[e.code] ?? 0) + 1;
  return out;
}

/** L3 — board card. */
export function refusalCatalogBoardCard(events: readonly RefusalEventInput[]): {
  readonly catalog: number;
  readonly events: number;
  readonly uniqueCodes: number;
  readonly undeclared: number;
} {
  const seen = new Set(events.map((e) => e.code));
  return {
    catalog: REFUSAL_CODE_CATALOG.length,
    events: events.length,
    uniqueCodes: seen.size,
    undeclared: 0, // typed input only admits catalog codes
  };
}

/** L3 — status line. */
export function refusalCatalogStatusLine(events: readonly RefusalEventInput[]): string {
  const c = refusalCatalogBoardCard(events);
  return `catalog=${c.catalog} events=${c.events} unique=${c.uniqueCodes} undeclared=${c.undeclared}`;
}

/** L3 — parse status. */
export function parseRefusalCatalogStatusLine(line: string): {
  readonly catalog: number;
  readonly events: number;
  readonly unique: number;
  readonly undeclared: number;
} | null {
  const m = line.trim().match(/^catalog=(\d+) events=(\d+) unique=(\d+) undeclared=(\d+)$/);
  if (!m) return null;
  return {
    catalog: Number(m[1]),
    events: Number(m[2]),
    unique: Number(m[3]),
    undeclared: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function refusalCatalogStatusLineMatches(events: readonly RefusalEventInput[]): boolean {
  const p = parseRefusalCatalogStatusLine(refusalCatalogStatusLine(events));
  if (!p) return false;
  const c = refusalCatalogBoardCard(events);
  return p.catalog === c.catalog && p.events === c.events && p.unique === c.uniqueCodes && p.undeclared === c.undeclared;
}

/** L3 — true when unique ≤ events and undeclared is 0 for typed boards. */
export function refusalCatalogStatusLineConsistent(line: string): boolean {
  const p = parseRefusalCatalogStatusLine(line);
  if (!p) return false;
  return p.unique <= p.events && p.undeclared === 0;
}

/** L3 — export header. */
export function refusalCatalogExportHeader(): string {
  return 'catalog,events,unique,undeclared';
}

/** L3 — export line. */
export function refusalCatalogExportLine(events: readonly RefusalEventInput[]): string {
  const c = refusalCatalogBoardCard(events);
  return `${c.catalog},${c.events},${c.uniqueCodes},${c.undeclared}`;
}

/** L3 — full export. */
export function refusalCatalogExportText(events: readonly RefusalEventInput[]): string {
  return [refusalCatalogExportHeader(), refusalCatalogExportLine(events)].join('\n');
}

/** L3 — catalog-only status (no events). */
export function refusalCatalogOnlyStatusLine(): string {
  return `catalog=${REFUSAL_CODE_CATALOG.length}`;
}

/** L3 — parse catalog-only. */
export function parseRefusalCatalogOnlyStatusLine(line: string): { readonly catalog: number } | null {
  const m = line.trim().match(/^catalog=(\d+)$/);
  if (!m) return null;
  return { catalog: Number(m[1]) };
}

/** L3 — true when catalog-only matches. */
export function refusalCatalogOnlyStatusLineMatches(): boolean {
  const p = parseRefusalCatalogOnlyStatusLine(refusalCatalogOnlyStatusLine());
  return p != null && p.catalog === REFUSAL_CODE_CATALOG.length;
}

/** L3 — has spend limit code. */
export function refusalCatalogHasSpendLimit(): boolean {
  return isDeclaredRefusalCode('agents.spend_limit');
}

/** L3 — event count in range. */
export function refusalEventCountInRange(events: readonly RefusalEventInput[], min: number, max: number): boolean {
  if (min > max) return false;
  const n = events.length;
  return n >= min && n <= max;
}
