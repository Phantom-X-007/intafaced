/**
 * THE CATALOG REGISTRY — which of the declared locales actually has words.
 *
 * WHY THIS FILE EXISTS. `locales.ts` declares 28 locales. `catalog.ts` holds
 * exactly one set of messages: English. Those two facts lived in separate files
 * with nothing joining them, and the gap between them was invisible from every
 * angle a person or a dashboard could look from:
 *
 *   - `SUPPORTED_LOCALES.length` is 28, and reads as coverage.
 *   - `isSupportedLocale('ar')` returns `true`, and reads as "we speak Arabic".
 *   - `createTranslator('ar')` returned a translator whose catalog defaulted to
 *     English, so it reported ZERO untranslated keys — the coverage number came
 *     back 100% for a language nobody has written a word of.
 *   - `README.md` documented `catalogFor(locale)`, which did not exist.
 *
 * So this file is the join, and it is deliberately the only place a catalog is
 * registered. `CATALOGS` is the honest answer to "what have we actually got",
 * and every count in this package is derived from it rather than asserted
 * beside it. Adding a language means adding a row here — and until that row
 * exists, nothing in this package will claim the language is translated.
 *
 * Adding a locale to `SUPPORTED_LOCALES` without a catalog is legitimate and
 * expected: it declares intent and reserves the code. It just no longer looks
 * like coverage.
 */
import { coverage, en, type MessageKey, type PartialCatalog } from './catalog.js';
import { SUPPORTED_LOCALES, locale as findLocale, type LocaleCode } from './locales.js';

/**
 * Every catalog that exists. Today: one.
 *
 * This is not a stub awaiting machine translation. A wrong string in a money
 * product is worse than an English one — a mistranslated "confirm withdrawal"
 * is a loss, not a typo — so a language lands here when a human has written it,
 * and never before. Adding one is an owner decision with a content cost.
 */
export const CATALOGS: Readonly<Partial<Record<LocaleCode, PartialCatalog>>> = {
  en,
};

/** An empty catalog: every key falls through to English and is reported `untranslated`. */
const NO_CATALOG: PartialCatalog = Object.freeze({});

/**
 * The catalog for a locale, or `undefined` when the locale is declared but has
 * no words yet. Aliases resolve (`zh-CN` → `zh-Hans`), so this answers for the
 * tag a browser actually sent.
 */
export function catalogFor(code: string): PartialCatalog | undefined {
  const descriptor = findLocale(code);
  return descriptor ? CATALOGS[descriptor.code as LocaleCode] : undefined;
}

/**
 * The catalog to translate with — never `undefined`, so a caller cannot
 * accidentally reach for English and thereby claim the locale is translated.
 * A locale with no catalog gets an empty one: same English text on screen,
 * but every key now travels the fallback path and is counted.
 */
export function catalogOrEmpty(code: string): PartialCatalog {
  return catalogFor(code) ?? NO_CATALOG;
}

/** Does this locale have any translated messages at all? */
export function hasCatalog(code: string): boolean {
  return catalogFor(code) !== undefined;
}

/** Locales with a catalog. The honest denominator for "languages we ship". */
export const TRANSLATED_LOCALES: readonly LocaleCode[] = SUPPORTED_LOCALES.filter((l) => CATALOGS[l.code as LocaleCode] !== undefined).map(
  (l) => l.code as LocaleCode,
);

/** Locales declared but not written. Requesting one of these serves English. */
export const UNTRANSLATED_LOCALES: readonly LocaleCode[] = SUPPORTED_LOCALES.filter(
  (l) => CATALOGS[l.code as LocaleCode] === undefined,
).map((l) => l.code as LocaleCode);

export interface LocaleCoverage {
  readonly code: LocaleCode;
  readonly englishName: string;
  /** `false` means every string in this locale is served from English. */
  readonly hasCatalog: boolean;
  readonly translated: number;
  readonly total: number;
  readonly missing: readonly MessageKey[];
}

/**
 * The full picture, one row per declared locale — what the "language dashboard"
 * in §9 should render. A locale with no catalog is `translated: 0`, not absent
 * from the table: the point of the table is that the declared-but-empty rows
 * are visible.
 */
export function localeCoverage(): readonly LocaleCoverage[] {
  return SUPPORTED_LOCALES.map((descriptor) => {
    const catalog = CATALOGS[descriptor.code as LocaleCode];
    const { translated, total, missing } = coverage(catalog ?? NO_CATALOG);
    return {
      code: descriptor.code as LocaleCode,
      englishName: descriptor.englishName,
      hasCatalog: catalog !== undefined,
      translated,
      total,
      missing,
    };
  });
}
