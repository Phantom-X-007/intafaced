/**
 * D26-P1-PT1M — academy.paper-trading mount vs tracker honest gaps.
 *
 * Paper market flag + ops gate — never invent fills or live balances.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAPER_TRADING_TRACKER_ID = 'academy.paper-trading' as const;

export const PAPER_PRODUCT_SYMBOLS = ['startPaperDrill', 'isPaperOpsEnabled', 'assertPaperNeverReadableAsRealMoney'] as const;

export const PAPER_DONE_BAR_TEST_FILES = [
  'workbook-loop.test.ts',
  'ops-gate.test.ts',
  'real-money-ban.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const PAPER_HONEST_GAPS = ['gap.workbook_ui_craft', 'gap.cert_progress_surface'] as const;

export function paperSymbolsInSource(): readonly (typeof PAPER_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const loop = readFileSync(join(here, 'workbook-loop.ts'), 'utf8');
  const gate = readFileSync(join(here, 'ops-gate.ts'), 'utf8');
  const ban = readFileSync(join(here, 'real-money-ban.ts'), 'utf8');
  const blob = [loop, gate, ban].join('\n');
  return PAPER_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function paperTradingHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const loop = readFileSync(join(here, 'workbook-loop.ts'), 'utf8');
  const ban = readFileSync(join(here, 'real-money-ban.ts'), 'utf8');
  return /Never invents fills/i.test(loop) && /paper: boolean/.test(loop) && /assertPaperNeverReadableAsRealMoney/.test(ban);
}

export function paperDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return PAPER_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function academyPaperTradingTrackerBackendDoneBarMet(): boolean {
  return paperSymbolsInSource().length === PAPER_PRODUCT_SYMBOLS.length && paperTradingHonestInSource() && paperDoneBarTestsPresent();
}

export function academyPaperTradingMountVsTrackerBoardCard(): {
  readonly tracker: typeof PAPER_TRADING_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = paperSymbolsInSource();
  return {
    tracker: PAPER_TRADING_TRACKER_ID,
    symbols: PAPER_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: PAPER_HONEST_GAPS.length,
    backendDoneBarMet: academyPaperTradingTrackerBackendDoneBarMet(),
  };
}
