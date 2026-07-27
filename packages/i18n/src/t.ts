/**
 * The translation function.
 *
 * Two behaviours are load-bearing and both are tested:
 *
 *  1. **Pluralisation is `Intl.PluralRules`.** Not `n === 1 ? a : b`. English
 *     has two plural forms; Russian has three, Arabic has six, Japanese has
 *     one. A ternary is wrong in most of the languages §9 promises, and it is
 *     wrong in a way nobody notices until a native speaker files a bug.
 *
 *  2. **Missing keys behave differently in dev and prod.** In dev a missing key
 *     throws, loudly, at the call site, so it is fixed by the person who caused
 *     it. In prod it falls back to English and reports — because an untranslated
 *     string is a small problem and a blank button is a big one.
 *
 * A key that exists in English but not yet in the target language is NOT a
 * missing key. Translations lag; that is expected, reported, and never fatal.
 */
import {
  en,
  isPluralMessage,
  type Catalog,
  type Message,
  type MessageKey,
  type ParamsFor,
  type PartialCatalog,
  type PluralCategory,
  type PluralMessage,
} from './catalog.js';
import { formatNumber } from './format.js';
import { DEFAULT_LOCALE, dir, intlTagFor, type Direction } from './locales.js';

export type ParamValue = string | number | bigint;

type ParamsObject<P extends string> = { readonly [K in P]: ParamValue };

/**
 * `t()` takes params only when the message has placeholders, and then it takes
 * exactly the ones the message declares. A forgotten `{symbol}` is a build
 * failure, not a rendered `undefined`.
 */
export type TranslateArgs<K extends MessageKey> = [ParamsFor<K>] extends [never] ? [] : [params: ParamsObject<ParamsFor<K>>];

export type I18nMode = 'dev' | 'prod';

export type MissingKind =
  /** The key exists nowhere — not in the locale catalog, not in English. A bug. */
  | 'missing-key'
  /** The key exists in English but not in this language yet. Expected; reported for the coverage dashboard. */
  | 'untranslated'
  /** The message wants a placeholder the caller did not supply. */
  | 'missing-param'
  /** The language's catalog has no entry for the plural category `Intl` selected. */
  | 'missing-plural-form';

export interface MissingReport {
  readonly kind: MissingKind;
  readonly key: string;
  readonly locale: string;
  /** Set for `missing-param`; the placeholder name. */
  readonly param?: string;
  /** Set for `missing-plural-form`; the CLDR category `Intl.PluralRules` chose. */
  readonly category?: PluralCategory;
}

export interface TranslatorOptions {
  /**
   * `'dev'` throws on a missing key or param; `'prod'` falls back and reports.
   * Defaults to `NODE_ENV === 'production' ? 'prod' : 'dev'`.
   */
  readonly mode?: I18nMode;
  /** The catalog consulted when the locale's catalog has no entry. Defaults to English. */
  readonly fallback?: Catalog;
  /** Where reports go. Defaults to a deduplicating `console.warn`. */
  readonly onMissing?: (report: MissingReport) => void;
}

export class MissingMessageError extends Error {
  readonly key: string;
  readonly locale: string;
  constructor(key: string, locale: string) {
    super(
      `No message for key "${key}" (locale "${locale}"). Add it to packages/i18n/src/catalog.ts — every user-facing string is keyed (§9).`,
    );
    this.name = 'MissingMessageError';
    this.key = key;
    this.locale = locale;
  }
}

export class MissingParamError extends Error {
  readonly key: string;
  readonly param: string;
  constructor(key: string, param: string) {
    super(`Message "${key}" needs the param "{${param}}" and it was not supplied.`);
    this.name = 'MissingParamError';
    this.key = key;
    this.param = param;
  }
}

export interface Translator {
  readonly locale: string;
  /** Layout direction for this locale — put it on the document element. */
  readonly dir: Direction;
  /** Translate. Typed: unknown keys and missing params do not compile. */
  t<K extends MessageKey>(key: K, ...args: TranslateArgs<K>): string;
  /**
   * The untyped door, for keys that only exist at runtime (error codes off the
   * wire, module ids). Same missing-key policy applies — this is an escape from
   * the type check, not from the discipline.
   */
  tUnsafe(key: string, params?: Readonly<Record<string, ParamValue>>): string;
  /** Is this key present in this language's own catalog (not the fallback)? */
  hasOwn(key: MessageKey): boolean;
}

function detectMode(): I18nMode {
  const env = typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined;
  return env === 'production' ? 'prod' : 'dev';
}

const reported = new Set<string>();

function defaultOnMissing(report: MissingReport): void {
  const signature = `${report.kind}|${report.locale}|${report.key}|${report.param ?? report.category ?? ''}`;
  if (reported.has(signature)) return;
  reported.add(signature);
  const detail = report.param ? ` param "${report.param}"` : report.category ? ` category "${report.category}"` : '';
  console.warn(`[i18n] ${report.kind}: "${report.key}" in "${report.locale}"${detail}`);
}

/** Test seam — the default reporter dedupes for the life of the process. */
export function resetMissingReportCache(): void {
  reported.clear();
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRules(tag: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(tag);
  if (!rules) {
    rules = new Intl.PluralRules(tag);
    pluralRulesCache.set(tag, rules);
  }
  return rules;
}

const PLACEHOLDER_RE = /\{(\w+)\}/g;

/**
 * Create a translator bound to a locale and its catalog.
 *
 * @param localeCode App locale code (`'ru'`, `'pt-BR'`, …).
 * @param catalog    That language's messages. May be partial — English fills the gaps.
 */
export function createTranslator(
  localeCode: string = DEFAULT_LOCALE,
  catalog: PartialCatalog = en,
  options: TranslatorOptions = {},
): Translator {
  const mode = options.mode ?? detectMode();
  const fallback: Catalog = options.fallback ?? (en as unknown as Catalog);
  const onMissing = options.onMissing ?? defaultOnMissing;
  const tag = intlTagFor(localeCode);
  const direction = dir(localeCode);

  function report(kind: MissingKind, key: string, extra: { param?: string; category?: PluralCategory } = {}): void {
    onMissing({ kind, key, locale: localeCode, ...extra });
  }

  /** Resolve a key to a message, applying the fallback and missing-key policy. */
  function resolve(key: string): { message: Message; translated: boolean } | undefined {
    const own = (catalog as Readonly<Record<string, Message | undefined>>)[key];
    if (own !== undefined) return { message: own, translated: true };

    const base = (fallback as Readonly<Record<string, Message | undefined>>)[key];
    if (base !== undefined) {
      if (localeCode !== DEFAULT_LOCALE) report('untranslated', key);
      return { message: base, translated: false };
    }
    return undefined;
  }

  /** Pick the plural form `Intl` says this language uses for this count. */
  function selectPluralForm(key: string, message: PluralMessage, count: ParamValue): string {
    const n = typeof count === 'bigint' ? Number(count) : typeof count === 'string' ? Number.parseInt(count, 10) : count;
    const category = pluralRules(tag).select(Number.isFinite(n) ? n : 0) as PluralCategory;

    const form = message[category];
    if (form !== undefined) return form;

    // The language uses a category its catalog does not carry yet. Try English's
    // form for that category, then this language's `other` — never blank.
    report('missing-plural-form', key, { category });
    const baseMessage = (fallback as Readonly<Record<string, Message | undefined>>)[key];
    if (isPluralMessage(baseMessage)) {
      const baseForm = baseMessage[category];
      if (baseForm !== undefined) return baseForm;
    }
    return message.other;
  }

  function interpolate(key: string, template: string, params: Readonly<Record<string, ParamValue>>): string {
    return template.replace(PLACEHOLDER_RE, (match, name: string) => {
      const value = params[name];
      if (value === undefined) {
        if (mode === 'dev') throw new MissingParamError(key, name);
        report('missing-param', key, { param: name });
        // Leave the placeholder visible. It is ugly on purpose — an obviously
        // broken string gets reported; a silent `undefined` gets shipped.
        return match;
      }
      // Numbers are localised too: "1,234" in en, "1 234" in ru, "١٢٣٤" in ar.
      return typeof value === 'string' ? value : formatNumber(value, localeCode);
    });
  }

  function translate(key: string, params: Readonly<Record<string, ParamValue>> = {}): string {
    const resolved = resolve(key);
    if (!resolved) {
      if (mode === 'dev') throw new MissingMessageError(key, localeCode);
      report('missing-key', key);
      // Last resort: the key itself. It is readable, greppable, and it is not blank.
      return key;
    }

    const { message } = resolved;
    if (isPluralMessage(message)) {
      const count = params['count'];
      if (count === undefined) {
        if (mode === 'dev') throw new MissingParamError(key, 'count');
        report('missing-param', key, { param: 'count' });
        return interpolate(key, message.other, params);
      }
      return interpolate(key, selectPluralForm(key, message, count), params);
    }

    return interpolate(key, message, params);
  }

  return {
    locale: localeCode,
    dir: direction,
    t<K extends MessageKey>(key: K, ...args: TranslateArgs<K>): string {
      return translate(key, (args[0] ?? {}) as Readonly<Record<string, ParamValue>>);
    },
    tUnsafe(key: string, params: Readonly<Record<string, ParamValue>> = {}): string {
      return translate(key, params);
    },
    hasOwn(key: MessageKey): boolean {
      return (catalog as Readonly<Record<string, Message | undefined>>)[key] !== undefined;
    },
  };
}

/** The plural categories a language actually uses — for translator tooling and catalog linting. */
export function pluralCategoriesFor(localeCode: string): readonly PluralCategory[] {
  const rules = pluralRules(intlTagFor(localeCode));
  const resolved = rules.resolvedOptions() as { pluralCategories?: string[] };
  if (resolved.pluralCategories) return resolved.pluralCategories as PluralCategory[];

  // Older runtimes do not expose `pluralCategories`; probe instead.
  const found = new Set<PluralCategory>();
  for (const n of [0, 1, 2, 3, 5, 11, 21, 100, 101, 1000000]) {
    found.add(rules.select(n) as PluralCategory);
  }
  return [...found];
}
