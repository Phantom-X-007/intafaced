/**
 * Payer-visible copy on hosted invoice / checkout.
 *
 * Resolves through `@intafaced/i18n` — same catalog as notify/support. Mode is
 * `prod` on purpose: a missing key must not throw on an anonymous checkout.
 * The translator returns the dotted key name, never invented English.
 *
 * Catalog keys used here already exist on tip. Pay-specific keys are not added
 * in this slice (`packages/i18n` is owned elsewhere).
 */

import { DEFAULT_LOCALE, createTranslator, type ParamValue, type Translator } from '@intafaced/i18n';

const cache = new Map<string, Translator>();

/** Bound translator for a locale. Prod missing-key policy: render the key. */
export function payerTranslator(locale: string = DEFAULT_LOCALE): Translator {
  const existing = cache.get(locale);
  if (existing) return existing;
  const created = createTranslator(locale, undefined, { mode: 'prod' });
  cache.set(locale, created);
  return created;
}

/**
 * Resolve a catalog key for a payer. Unknown keys return the dotted name.
 */
export function resolvePayerCopy(key: string, params: Readonly<Record<string, ParamValue>> = {}, locale: string = DEFAULT_LOCALE): string {
  return payerTranslator(locale).tUnsafe(key, params);
}

/** Catalog keys this surface already has on tip — not a second catalog. */
export const PAYER_COPY_KEYS = {
  continue: 'common.action.continue',
  amount: 'common.label.amount',
  notFound: 'error.notFound',
  generic: 'error.generic',
  rateLimited: 'error.rateLimited',
  invalidAmount: 'error.validation.invalidAmount',
  required: 'error.validation.required',
} as const;
