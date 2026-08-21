/**
 * D26-P1-C2M — academy.ambassadors mount vs tracker honest gaps.
 *
 * IFC pay + revenue share under owner rate law only — never invent rates.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AMBASSADORS_TRACKER_ID = 'academy.ambassadors' as const;

export const AMBASSADORS_PRODUCT_SYMBOLS = [
  'UNPUBLISHED_AMBASSADOR_IFC_PAY_LAW',
  'refuseAmbassadorIfcPay',
  'attemptAmbassadorPay',
  'decidePublicAmbassadorPayQuote',
] as const;

export const AMBASSADORS_DONE_BAR_TEST_FILES = [
  'ifc-pay-rate-law.test.ts',
  'ifc-pay.test.ts',
  'pay.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const AMBASSADORS_HONEST_GAPS = ['gap.ledger_settlement_recipe_class_m', 'gap.revenue_share_product_law'] as const;

export function ambassadorsSymbolsInSource(): readonly (typeof AMBASSADORS_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const law = readFileSync(join(here, 'ifc-pay-rate-law.ts'), 'utf8');
  const pay = readFileSync(join(here, 'ifc-pay.ts'), 'utf8');
  const blob = [law, pay].join('\n');
  return AMBASSADORS_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function ambassadorsPayHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const law = readFileSync(join(here, 'ifc-pay-rate-law.ts'), 'utf8');
  const pay = readFileSync(join(here, 'ifc-pay.ts'), 'utf8');
  return (
    /published: false/.test(law) &&
    /Never invent session credits/i.test(law) &&
    /refuseAmbassadorIfcPay/.test(pay) &&
    /unsetRatesPublicDoorHolds/.test(pay)
  );
}

export function ambassadorsDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return AMBASSADORS_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function academyAmbassadorsTrackerBackendDoneBarMet(): boolean {
  return (
    ambassadorsSymbolsInSource().length === AMBASSADORS_PRODUCT_SYMBOLS.length &&
    ambassadorsPayHonestInSource() &&
    ambassadorsDoneBarTestsPresent()
  );
}

export function academyAmbassadorsMountVsTrackerBoardCard(): {
  readonly tracker: typeof AMBASSADORS_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = ambassadorsSymbolsInSource();
  return {
    tracker: AMBASSADORS_TRACKER_ID,
    symbols: AMBASSADORS_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: AMBASSADORS_HONEST_GAPS.length,
    backendDoneBarMet: academyAmbassadorsTrackerBackendDoneBarMet(),
  };
}
