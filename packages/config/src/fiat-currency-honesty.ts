/**
 * Config L3 — pure fiat-currency catalog honesty (structural only).
 *
 * Reads FIAT_CURRENCIES from fiat.ts (§6.2 config-not-code).
 * Does not invent P2P rails, settlement policy, or enablement decisions.
 */

import { FIAT_CURRENCIES } from './fiat.js';

export const FIAT_CODES = FIAT_CURRENCIES.map((c) => c.code) as readonly string[];

/** L3 — catalog board. */
export function fiatCurrencyCatalogBoardCard(): {
  readonly currencies: number;
  readonly hasUsd: number;
  readonly hasEur: number;
  readonly hasJpy: number;
  readonly zeroMinor: number;
} {
  return {
    currencies: FIAT_CURRENCIES.length,
    hasUsd: FIAT_CURRENCIES.some((c) => c.code === 'USD') ? 1 : 0,
    hasEur: FIAT_CURRENCIES.some((c) => c.code === 'EUR') ? 1 : 0,
    hasJpy: FIAT_CURRENCIES.some((c) => c.code === 'JPY') ? 1 : 0,
    zeroMinor: FIAT_CURRENCIES.filter((c) => c.minorUnits === 0).length,
  };
}

/** L3 — status line. */
export function fiatCurrencyCatalogStatusLine(): string {
  const c = fiatCurrencyCatalogBoardCard();
  return `currencies=${c.currencies} usd=${c.hasUsd} eur=${c.hasEur} jpy=${c.hasJpy} zeroMinor=${c.zeroMinor}`;
}

/** L3 — parse status. */
export function parseFiatCurrencyCatalogStatusLine(line: string): {
  readonly currencies: number;
  readonly usd: number;
  readonly eur: number;
  readonly jpy: number;
  readonly zeroMinor: number;
} | null {
  const m = line.trim().match(/^currencies=(\d+) usd=([01]) eur=([01]) jpy=([01]) zeroMinor=(\d+)$/);
  if (!m) return null;
  return {
    currencies: Number(m[1]),
    usd: Number(m[2]),
    eur: Number(m[3]),
    jpy: Number(m[4]),
    zeroMinor: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function fiatCurrencyCatalogStatusLineMatches(): boolean {
  const p = parseFiatCurrencyCatalogStatusLine(fiatCurrencyCatalogStatusLine());
  if (!p) return false;
  const c = fiatCurrencyCatalogBoardCard();
  return p.currencies === c.currencies && p.usd === c.hasUsd && p.eur === c.hasEur && p.jpy === c.hasJpy && p.zeroMinor === c.zeroMinor;
}

/** L3 — non-empty registry with majors. */
export function fiatCurrencyCatalogStatusLineConsistent(line: string): boolean {
  const p = parseFiatCurrencyCatalogStatusLine(line);
  if (!p) return false;
  return p.currencies >= 100 && p.usd === 1 && p.eur === 1 && p.jpy === 1;
}

/** L3 — export header. */
export function fiatCurrencyCatalogExportHeader(): string {
  return 'fiat_code';
}

/** L3 — export lines. */
export function fiatCurrencyCatalogExportLines(): readonly string[] {
  return [...FIAT_CODES];
}

/** L3 — full export. */
export function fiatCurrencyCatalogExportText(): string {
  return [fiatCurrencyCatalogExportHeader(), ...fiatCurrencyCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredFiatCurrency(code: string): boolean {
  return FIAT_CODES.includes(code);
}
