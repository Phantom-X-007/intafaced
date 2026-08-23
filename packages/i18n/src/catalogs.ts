/**
 * THE CATALOG REGISTRY — which of the declared locales actually has words.
 *
 * `locales.ts` declares 100+ codes. Every code has a CATALOGS entry so `$t`
 * never echoes a raw key: untranslated locales are empty catalogs and fall
 * through to English. Words are still measured honestly — an empty catalog
 * is not "translated".
 *
 * Three locales carry distinct copy (en, es, fr). Literary translation of
 * the rest is residual, not a second mountain. Adding a language with real
 * words means filling that locale's catalog — not a refactor.
 */
import { coverage, en, type MessageKey, type PartialCatalog } from './catalog.js';
import { SUPPORTED_LOCALES, locale as findLocale, type LocaleCode } from './locales.js';

/** Distinct Spanish strings — enough to prove the locale is not English. */
const es: PartialCatalog = {
  'auth.login.title': 'Iniciar sesión',
  'auth.logout': 'Cerrar sesión',
  'common.action.confirm': 'Confirmar',
  'common.action.cancel': 'Cancelar',
};

/** Distinct French strings — enough to prove the locale is not English. */
const fr: PartialCatalog = {
  'auth.login.title': 'Connexion',
  'auth.logout': 'Déconnexion',
  'common.action.confirm': 'Confirmer',
  'common.action.cancel': 'Annuler',
};

const WRITTEN: Readonly<Partial<Record<LocaleCode, PartialCatalog>>> = {
  en,
  es,
  fr,
};

/** An empty catalog: every key falls through to English and is reported `untranslated`. */
const NO_CATALOG: PartialCatalog = Object.freeze({});

/**
 * Every declared locale has an entry. Untranslated locales get `NO_CATALOG` so
 * lookup never returns `undefined` for a supported code. Coverage still counts
 * empty catalogs as zero words — `hasCatalog` means "has words", not "is listed".
 */
export const CATALOGS: Readonly<Record<LocaleCode, PartialCatalog>> = Object.freeze(
  Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l.code, WRITTEN[l.code as LocaleCode] ?? NO_CATALOG])) as Record<
    LocaleCode,
    PartialCatalog
  >,
);

/** True when the catalog object actually holds at least one message. */
export function catalogHasWords(catalog: PartialCatalog | undefined): boolean {
  if (catalog === undefined) return false;
  for (const key of Object.keys(catalog)) {
    if ((catalog as Record<string, unknown>)[key] !== undefined) return true;
  }
  return false;
}

/**
 * The catalog for a locale, or `undefined` when the tag is not a declared
 * locale at all. Aliases resolve (`zh-CN` → `zh-Hans`). A declared-but-empty
 * locale returns the empty catalog, not `undefined`.
 */
export function catalogFor(code: string): PartialCatalog | undefined {
  const descriptor = findLocale(code);
  return descriptor ? CATALOGS[descriptor.code as LocaleCode] : undefined;
}

/**
 * The catalog to translate with — never `undefined`, so a caller cannot
 * accidentally reach for English and thereby claim the locale is translated.
 * A locale with no words gets an empty one: same English text on screen,
 * but every key now travels the fallback path and is counted.
 */
export function catalogOrEmpty(code: string): PartialCatalog {
  return catalogFor(code) ?? NO_CATALOG;
}

/** Does this locale have any translated messages at all? Empty registry rows do not count. */
export function hasCatalog(code: string): boolean {
  return catalogHasWords(catalogFor(code));
}

/** Locales with written words. The honest denominator for "languages we ship copy in". */
export const TRANSLATED_LOCALES: readonly LocaleCode[] = SUPPORTED_LOCALES.filter((l) => hasCatalog(l.code)).map(
  (l) => l.code as LocaleCode,
);

/** Locales declared but not written. Requesting one of these serves English. */
export const UNTRANSLATED_LOCALES: readonly LocaleCode[] = SUPPORTED_LOCALES.filter((l) => !hasCatalog(l.code)).map(
  (l) => l.code as LocaleCode,
);

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
 * in §9 should render. A locale with no words is `translated: 0`, not absent
 * from the table.
 */
export function localeCoverage(): readonly LocaleCoverage[] {
  return SUPPORTED_LOCALES.map((descriptor) => {
    const catalog = CATALOGS[descriptor.code as LocaleCode];
    const { translated, total, missing } = coverage(catalog ?? NO_CATALOG);
    return {
      code: descriptor.code as LocaleCode,
      englishName: descriptor.englishName,
      hasCatalog: catalogHasWords(catalog),
      translated,
      total,
      missing,
    };
  });
}
