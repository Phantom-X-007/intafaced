/**
 * CURRICULUM I18N STRATEGY — Stage-3 polish (TRK-academy.curriculum).
 *
 * Long bodies stay English (`en`) until real translated assets land.
 * Missing locales fall back to the default body — we never invent a translation.
 * No partner brand names; no money; no fake market quotes.
 */

/** Default (and currently only shipped) curriculum locale. */
export const CURRICULUM_DEFAULT_LOCALE = 'en' as const;

export type CurriculumLocale = typeof CURRICULUM_DEFAULT_LOCALE;

/** Locales with real body assets on tip. Expand only when translations exist. */
export const CURRICULUM_LOCALES_WITH_BODIES: readonly CurriculumLocale[] = [CURRICULUM_DEFAULT_LOCALE];

const LOCALE_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export type CurriculumLocaleResolution = {
  readonly requested: string | null;
  /** Locale actually used for the body. */
  readonly locale: CurriculumLocale;
  /** True when requested was missing/unsupported and we fell back to default. */
  readonly fellBack: boolean;
};

/**
 * Resolve a requested locale against shipped body assets.
 * Unknown / empty / malformed → default `en` with fellBack=true.
 */
export function resolveCurriculumLocale(requested?: string | null): CurriculumLocaleResolution {
  const raw = typeof requested === 'string' ? requested.trim() : '';
  if (!raw) {
    return { requested: null, locale: CURRICULUM_DEFAULT_LOCALE, fellBack: true };
  }
  if (!LOCALE_RE.test(raw)) {
    return { requested: raw, locale: CURRICULUM_DEFAULT_LOCALE, fellBack: true };
  }
  if ((CURRICULUM_LOCALES_WITH_BODIES as readonly string[]).includes(raw)) {
    return { requested: raw, locale: raw as CurriculumLocale, fellBack: false };
  }
  return { requested: raw, locale: CURRICULUM_DEFAULT_LOCALE, fellBack: true };
}

/**
 * Pick a body for a locale. Tip catalog stores a single default body;
 * unsupported locales return that body with fellBack=true (no invent).
 */
export function curriculumBodyForLocale(
  defaultBody: string,
  requested?: string | null,
): { readonly body: string; readonly resolution: CurriculumLocaleResolution } {
  const resolution = resolveCurriculumLocale(requested);
  return { body: defaultBody, resolution };
}

/** Operator-facing one-liner: which locales have bodies vs fallback policy. */
export function curriculumI18nStrategyLine(): string {
  return `default=${CURRICULUM_DEFAULT_LOCALE} withBodies=${CURRICULUM_LOCALES_WITH_BODIES.join('|')} fallback=default neverInvent=1`;
}

/** True when strategy names default locale and refuses invent. */
export function curriculumI18nStrategyHonest(): boolean {
  const line = curriculumI18nStrategyLine();
  return (
    line.includes(`default=${CURRICULUM_DEFAULT_LOCALE}`) &&
    line.includes('neverInvent=1') &&
    CURRICULUM_LOCALES_WITH_BODIES.includes(CURRICULUM_DEFAULT_LOCALE)
  );
}
