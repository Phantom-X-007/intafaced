/**
 * The supported-locale registry — §9: "100+ languages = translation files, not
 * refactors".
 *
 * Adding a language is two changes: a row here, and a catalog file. No surface
 * is touched, no component is edited, nothing is rebuilt but the bundle. That
 * is the whole promise of keying from day one.
 *
 * `code` is what the app stores and puts in a URL. `intlTag` is what we hand to
 * `Intl.*` — sometimes region-qualified, because number and date conventions
 * are regional even when the language is not.
 */

export interface LocaleDescriptor {
  /** Canonical app locale code (BCP-47 subset). Stored on the account, used in routes. */
  readonly code: string;
  /** Name in English — for admin surfaces and support tooling. */
  readonly englishName: string;
  /** Name in the language itself — for the language picker. Users pick their own name, not ours. */
  readonly nativeName: string;
  /** Right-to-left script. Drives `dir` on the document element and mirrored layout. */
  readonly rtl: boolean;
  /** Tag handed to `Intl.NumberFormat` / `DateTimeFormat` / `PluralRules` / `RelativeTimeFormat`. */
  readonly intlTag: string;
}

/**
 * The launch set. Chosen to cover the markets the §25 matrix implies — the fiat
 * registry in `@intafaced/config` already carries 100+ currencies, and this
 * table grows to meet it one row at a time.
 */
export const SUPPORTED_LOCALES = [
  { code: 'en', englishName: 'English', nativeName: 'English', rtl: false, intlTag: 'en-US' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', rtl: false, intlTag: 'es-ES' },
  { code: 'pt-BR', englishName: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', rtl: false, intlTag: 'pt-BR' },
  { code: 'fr', englishName: 'French', nativeName: 'Français', rtl: false, intlTag: 'fr-FR' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', rtl: false, intlTag: 'de-DE' },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano', rtl: false, intlTag: 'it-IT' },
  { code: 'nl', englishName: 'Dutch', nativeName: 'Nederlands', rtl: false, intlTag: 'nl-NL' },
  { code: 'pl', englishName: 'Polish', nativeName: 'Polski', rtl: false, intlTag: 'pl-PL' },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский', rtl: false, intlTag: 'ru-RU' },
  { code: 'uk', englishName: 'Ukrainian', nativeName: 'Українська', rtl: false, intlTag: 'uk-UA' },
  { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', rtl: false, intlTag: 'tr-TR' },
  { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', rtl: true, intlTag: 'ar-EG' },
  { code: 'he', englishName: 'Hebrew', nativeName: 'עברית', rtl: true, intlTag: 'he-IL' },
  { code: 'fa', englishName: 'Persian', nativeName: 'فارسی', rtl: true, intlTag: 'fa-IR' },
  { code: 'ur', englishName: 'Urdu', nativeName: 'اردو', rtl: true, intlTag: 'ur-PK' },
  { code: 'hi', englishName: 'Hindi', nativeName: 'हिन्दी', rtl: false, intlTag: 'hi-IN' },
  { code: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', rtl: false, intlTag: 'bn-BD' },
  { code: 'id', englishName: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false, intlTag: 'id-ID' },
  { code: 'ms', englishName: 'Malay', nativeName: 'Bahasa Melayu', rtl: false, intlTag: 'ms-MY' },
  { code: 'th', englishName: 'Thai', nativeName: 'ไทย', rtl: false, intlTag: 'th-TH' },
  { code: 'vi', englishName: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false, intlTag: 'vi-VN' },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語', rtl: false, intlTag: 'ja-JP' },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어', rtl: false, intlTag: 'ko-KR' },
  { code: 'zh-Hans', englishName: 'Chinese (Simplified)', nativeName: '简体中文', rtl: false, intlTag: 'zh-Hans-CN' },
  { code: 'zh-Hant', englishName: 'Chinese (Traditional)', nativeName: '繁體中文', rtl: false, intlTag: 'zh-Hant-TW' },
  { code: 'fil', englishName: 'Filipino', nativeName: 'Filipino', rtl: false, intlTag: 'fil-PH' },
  { code: 'sw', englishName: 'Swahili', nativeName: 'Kiswahili', rtl: false, intlTag: 'sw-KE' },
  { code: 'ha', englishName: 'Hausa', nativeName: 'Hausa', rtl: false, intlTag: 'ha-NG' },
] as const satisfies readonly LocaleDescriptor[];

/** Every locale code the app is allowed to be in. */
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];

/** The source-of-truth language. Also the fallback when a key is untranslated. */
export const DEFAULT_LOCALE: LocaleCode = 'en';

export type Direction = 'ltr' | 'rtl';

const BY_CODE = new Map<string, LocaleDescriptor>(SUPPORTED_LOCALES.map((l) => [l.code.toLowerCase(), l]));

/**
 * Legacy and region tags people actually send in `Accept-Language`, mapped to
 * the code we store. Extend as real traffic shows up — guessing is worse.
 */
const ALIASES: Readonly<Record<string, LocaleCode>> = {
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-my': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  zh: 'zh-Hans',
  pt: 'pt-BR',
  'pt-pt': 'pt-BR',
  in: 'id',
  iw: 'he',
  tl: 'fil',
};

/** Look up a locale by code. Case-insensitive; aliases resolved. */
export function locale(code: string): LocaleDescriptor | undefined {
  const key = code.trim().toLowerCase();
  const direct = BY_CODE.get(key);
  if (direct) return direct;
  const alias = ALIASES[key];
  return alias ? BY_CODE.get(alias.toLowerCase()) : undefined;
}

export function isSupportedLocale(code: string): code is LocaleCode {
  return locale(code) !== undefined;
}

/** Right-to-left? Unknown codes are treated as LTR — English is LTR. */
export function isRtl(code: string): boolean {
  return locale(code)?.rtl ?? false;
}

/** The `dir` attribute for the document element. */
export function dir(code: string): Direction {
  return isRtl(code) ? 'rtl' : 'ltr';
}

/** The tag to hand `Intl`. Unknown codes pass through — `Intl` has its own fallback chain. */
export function intlTagFor(code: string): string {
  return locale(code)?.intlTag ?? code;
}

/** Every RTL locale — useful for layout test matrices. */
export function rtlLocales(): readonly LocaleDescriptor[] {
  return SUPPORTED_LOCALES.filter((l) => l.rtl);
}

/**
 * Pick the best supported locale for a request.
 *
 * Accepts either raw `Accept-Language` values or plain tags, in priority order.
 * Falls back through the primary subtag (`pt-PT` → `pt-BR`) before giving up,
 * because serving English to a Portuguese speaker over a region mismatch is a
 * self-inflicted wound.
 */
export function negotiateLocale(requested: readonly string[], fallback: LocaleCode = DEFAULT_LOCALE): LocaleCode {
  for (const raw of requested) {
    const tag = raw.split(';')[0]?.trim();
    if (!tag) continue;

    const exact = locale(tag);
    if (exact) return exact.code as LocaleCode;

    const primary = tag.split('-')[0]?.toLowerCase();
    if (!primary) continue;

    const byPrimary = locale(primary) ?? SUPPORTED_LOCALES.find((l) => l.code.toLowerCase().split('-')[0] === primary);
    if (byPrimary) return byPrimary.code as LocaleCode;
  }
  return fallback;
}

/** Parse an `Accept-Language` header into tags in descending quality order. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.split(';').map((s) => s.trim());
      const q = params.find((p) => p.startsWith('q='));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag, quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}
