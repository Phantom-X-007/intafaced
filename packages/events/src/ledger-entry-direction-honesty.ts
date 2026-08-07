/**
 * Events L3 — pure ledger entry direction catalog honesty (structural only).
 *
 * Mirrors catalog.ts entry direction: debit | credit.
 * Does not invent ledger recipes or money movement.
 */

export const LEDGER_ENTRY_DIRECTIONS = ['debit', 'credit'] as const;
export type LedgerEntryDirectionId = (typeof LEDGER_ENTRY_DIRECTIONS)[number];

/** L3 — catalog board. */
export function ledgerEntryDirectionCatalogBoardCard(): {
  readonly directions: number;
  readonly hasDebit: number;
  readonly hasCredit: number;
} {
  return {
    directions: LEDGER_ENTRY_DIRECTIONS.length,
    hasDebit: LEDGER_ENTRY_DIRECTIONS.includes('debit') ? 1 : 0,
    hasCredit: LEDGER_ENTRY_DIRECTIONS.includes('credit') ? 1 : 0,
  };
}

/** L3 — status line. */
export function ledgerEntryDirectionCatalogStatusLine(): string {
  const c = ledgerEntryDirectionCatalogBoardCard();
  return `directions=${c.directions} debit=${c.hasDebit} credit=${c.hasCredit}`;
}

/** L3 — parse status. */
export function parseLedgerEntryDirectionCatalogStatusLine(line: string): {
  readonly directions: number;
  readonly debit: number;
  readonly credit: number;
} | null {
  const m = line.trim().match(/^directions=(\d+) debit=([01]) credit=([01])$/);
  if (!m) return null;
  return { directions: Number(m[1]), debit: Number(m[2]), credit: Number(m[3]) };
}

/** L3 — true when status matches. */
export function ledgerEntryDirectionCatalogStatusLineMatches(): boolean {
  const p = parseLedgerEntryDirectionCatalogStatusLine(ledgerEntryDirectionCatalogStatusLine());
  if (!p) return false;
  const c = ledgerEntryDirectionCatalogBoardCard();
  return p.directions === c.directions && p.debit === c.hasDebit && p.credit === c.hasCredit;
}

/** L3 — dual-entry pair. */
export function ledgerEntryDirectionCatalogStatusLineConsistent(line: string): boolean {
  const p = parseLedgerEntryDirectionCatalogStatusLine(line);
  if (!p) return false;
  return p.directions === 2 && p.debit === 1 && p.credit === 1;
}

/** L3 — export header. */
export function ledgerEntryDirectionCatalogExportHeader(): string {
  return 'ledger_entry_direction';
}

/** L3 — export lines. */
export function ledgerEntryDirectionCatalogExportLines(): readonly string[] {
  return [...LEDGER_ENTRY_DIRECTIONS];
}

/** L3 — full export. */
export function ledgerEntryDirectionCatalogExportText(): string {
  return [ledgerEntryDirectionCatalogExportHeader(), ...ledgerEntryDirectionCatalogExportLines()].join('\n');
}

/** L3 — direction declared. */
export function isDeclaredLedgerEntryDirection(direction: string): boolean {
  return (LEDGER_ENTRY_DIRECTIONS as readonly string[]).includes(direction);
}
