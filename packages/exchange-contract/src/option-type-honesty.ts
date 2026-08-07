/**
 * Exchange-contract L3 — pure option-type catalog honesty (structural only).
 *
 * Mirrors marketSchema optionType: call | put.
 * Does not invent strike prices or money.
 */

export const OPTION_TYPES = ['call', 'put'] as const;
export type OptionTypeId = (typeof OPTION_TYPES)[number];

/** L3 — catalog board. */
export function optionTypeCatalogBoardCard(): {
  readonly types: number;
  readonly hasCall: number;
  readonly hasPut: number;
} {
  return {
    types: OPTION_TYPES.length,
    hasCall: OPTION_TYPES.includes('call') ? 1 : 0,
    hasPut: OPTION_TYPES.includes('put') ? 1 : 0,
  };
}

/** L3 — status line. */
export function optionTypeCatalogStatusLine(): string {
  const c = optionTypeCatalogBoardCard();
  return `types=${c.types} call=${c.hasCall} put=${c.hasPut}`;
}

/** L3 — parse status. */
export function parseOptionTypeCatalogStatusLine(line: string): {
  readonly types: number;
  readonly call: number;
  readonly put: number;
} | null {
  const m = line.trim().match(/^types=(\d+) call=([01]) put=([01])$/);
  if (!m) return null;
  return {
    types: Number(m[1]),
    call: Number(m[2]),
    put: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function optionTypeCatalogStatusLineMatches(): boolean {
  const p = parseOptionTypeCatalogStatusLine(optionTypeCatalogStatusLine());
  if (!p) return false;
  const c = optionTypeCatalogBoardCard();
  return p.types === c.types && p.call === c.hasCall && p.put === c.hasPut;
}

/** L3 — two types. */
export function optionTypeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOptionTypeCatalogStatusLine(line);
  if (!p) return false;
  return p.types === 2 && p.call === 1 && p.put === 1;
}

/** L3 — export header. */
export function optionTypeCatalogExportHeader(): string {
  return 'option_type';
}

/** L3 — export lines. */
export function optionTypeCatalogExportLines(): readonly string[] {
  return [...OPTION_TYPES];
}

/** L3 — full export. */
export function optionTypeCatalogExportText(): string {
  return [optionTypeCatalogExportHeader(), ...optionTypeCatalogExportLines()].join('\n');
}

/** L3 — type declared. */
export function isDeclaredOptionType(t: string): boolean {
  return (OPTION_TYPES as readonly string[]).includes(t);
}
