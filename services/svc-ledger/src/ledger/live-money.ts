import { InvalidEntryError, parseAmount, type Amount, type EntryInput } from '@intafaced/ledger-client';

/**
 * Live money in this service is a scaled bigint. A JS number is already rounded.
 * Refuse it by type — never coerce, never parseFloat, never the Number constructor.
 */
export function assertScaledBigintAmounts(entries: readonly EntryInput[]): void {
  for (const entry of entries) {
    if (typeof entry.amount !== 'bigint') {
      throw new InvalidEntryError(`Amount must be a scaled bigint, never a JS number (got ${typeof entry.amount})`);
    }
  }
}

/** Stored numeric columns arrive as decimal strings. A JS number is a live-path lie. */
export function parseStoredAmount(value: unknown, field: string): Amount {
  if (typeof value === 'number') {
    throw new InvalidEntryError(`${field} arrived as a JS number — the book stores decimal strings, never floats`);
  }
  if (typeof value !== 'string' && typeof value !== 'bigint') {
    throw new InvalidEntryError(`${field} must be a decimal string, got ${typeof value}`);
  }
  return parseAmount(value);
}
