import { en, type MessageKey, type Message, type PartialCatalog, type PluralCategory, type PluralMessage } from './catalog.js';

/**
 * THE TRANSLATOR BOUNDARY — how English gets out, and how a language gets back.
 *
 * §9 wants 100+ languages. `catalogs.ts` says what we actually have: one. The
 * gap is not a missing feature in this package — it is that a human has to
 * write every string, and that work happens in a translation tool, not in a
 * `.ts` file. This module is the only door between the two.
 *
 * ── WHY A DOOR NEEDS A GUARD ─────────────────────────────────────────────
 *
 * Everything else in this package is safe because it is COMPILED. `defineCatalog`
 * fails to build when a key is missing, and `t()` derives its params from the
 * message so a forgotten `{symbol}` is a build error. That guarantee is worth
 * more than any runtime check and none of it is being replaced.
 *
 * But an imported translation is DATA. It arrives as JSON from a service, typed
 * by nobody, written by a translator who cannot see our types and quite
 * reasonably does not know that `{amount}` is load-bearing. Every guarantee the
 * compiler gives an in-repo catalog has to be re-earned at this boundary, at
 * runtime, or it is simply not there:
 *
 *   · a key English never declared      → rejected (it can never render)
 *   · a placeholder dropped or invented → rejected
 *   · a plural collapsed into a string  → rejected
 *   · a plural missing `other`          → rejected
 *
 * The last three are the ones that matter in a money product. `t()` throws
 * `MissingParamError` when a message needs `{amount}` and the caller did not
 * supply it — but a translation that DROPPED `{amount}` throws nothing at all.
 * It renders "Withdraw confirmed" where English rendered "Withdraw {amount}
 * confirmed", and it is a user reading a number that is not there. A dropped
 * placeholder is silent, plausible and wrong, which is the exact profile of a
 * defect that ships.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────
 *
 * No I/O, no HTTP, no vendor. The package header says "Nothing here does I/O.
 * Catalogs are data; loading them is the app's job", and that stays true — this
 * turns catalogs into a transport shape and back, and whoever moves the bytes
 * is somebody else's problem. It also does not machine-translate: `catalogs.ts`
 * is explicit that a language lands when a human has written it, "and never
 * before".
 */

/** `{name}` — the same pattern `t()` resolves against, kept identical on purpose. */
const PLACEHOLDER_RE = /\{(\w+)\}/g;

const PLURAL_CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** One message, as a translation tool sees it. */
export interface TranslationUnit {
  readonly key: MessageKey;
  /** English, verbatim — the source a translator works from. */
  readonly source: string | Readonly<Record<string, string>>;
  /**
   * Placeholders the translation MUST reproduce. Extracted rather than
   * documented, so it cannot drift from the string beside it.
   */
  readonly placeholders: readonly string[];
  /** True when this key is count-dependent and the answer is a category map. */
  readonly plural: boolean;
}

export interface TranslationBundle {
  /** Always `en` today. Named rather than assumed, so a future re-source is visible. */
  readonly sourceLocale: string;
  readonly units: readonly TranslationUnit[];
}

/** Placeholder names in a message, in first-appearance order, deduplicated. */
export function placeholdersIn(message: Message): readonly string[] {
  const texts = typeof message === 'string' ? [message] : Object.values(message);
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of String(text).matchAll(PLACEHOLDER_RE)) {
      const name = match[1];
      if (name !== undefined) found.add(name);
    }
  }
  return [...found];
}

/**
 * English, in a shape a translation platform can ingest.
 *
 * Emits every key including the untranslatable-looking ones. Deciding which
 * strings "need" translating is exactly the judgement that leaves a language
 * 98% done forever.
 */
export function exportSourceBundle(): TranslationBundle {
  const units: TranslationUnit[] = [];

  for (const key of Object.keys(en) as MessageKey[]) {
    const message = en[key] as Message;
    units.push({
      key,
      source: typeof message === 'string' ? message : ({ ...message } as Readonly<Record<string, string>>),
      placeholders: placeholdersIn(message),
      plural: typeof message !== 'string',
    });
  }

  return { sourceLocale: 'en', units };
}

/** One reason one key was refused. Never a count — a count cannot be fixed. */
export interface ImportProblem {
  readonly key: string;
  readonly reason: string;
}

export interface ImportResult {
  /** Everything that passed. Safe to register in `CATALOGS`. */
  readonly catalog: PartialCatalog;
  /** Everything that did not, and why. */
  readonly problems: readonly ImportProblem[];
  readonly accepted: number;
}

/**
 * Turn a translator's payload into a `PartialCatalog`, refusing anything that
 * would render wrongly.
 *
 * PARTIAL IS FINE, WRONG IS NOT. A translation in progress is normal and
 * `createTranslator` falls back to English per key, so a missing key is not a
 * problem and is not reported as one. What is refused is a key that would
 * render, and render incorrectly.
 *
 * Returns problems rather than throwing: a 4,000-key import that dies on the
 * first bad entry tells a translator one thing per round trip, and there are
 * only so many round trips before somebody pastes it in by hand instead.
 */
export function importTranslations(input: Readonly<Record<string, unknown>>): ImportResult {
  const catalog: Record<string, string | PluralMessage> = {};
  const problems: ImportProblem[] = [];

  for (const [key, value] of Object.entries(input)) {
    const source = (en as Readonly<Record<string, Message>>)[key];

    // A key English never declared can never render: `t()` resolves against the
    // English key set, so this would sit in the catalog forever, unreachable
    // and looking like coverage.
    if (source === undefined) {
      problems.push({
        key,
        reason: 'not a key in the English catalog — it can never be rendered, so it is not translation, it is dead weight',
      });
      continue;
    }

    const sourceIsPlural = typeof source !== 'string';
    const valueIsPlural = typeof value === 'object' && value !== null && !Array.isArray(value);

    if (typeof value !== 'string' && !valueIsPlural) {
      problems.push({ key, reason: `expected a string or a plural object, got ${value === null ? 'null' : typeof value}` });
      continue;
    }

    if (sourceIsPlural !== valueIsPlural) {
      problems.push({
        key,
        reason: sourceIsPlural
          ? 'English is count-dependent and this is a single string — a plural collapsed to one form reads wrongly at every count but one'
          : 'English is a single string and this is a plural object — `t()` will not select a category for a key that has no count',
      });
      continue;
    }

    if (valueIsPlural) {
      const categories = value as Readonly<Record<string, unknown>>;
      const unknown = Object.keys(categories).filter((c) => !(PLURAL_CATEGORIES as readonly string[]).includes(c));
      if (unknown.length > 0) {
        problems.push({ key, reason: `unknown plural category: ${unknown.join(', ')} — CLDR defines ${PLURAL_CATEGORIES.join('/')}` });
        continue;
      }
      // CLDR guarantees every language has `other`, and `t()` falls back to it.
      // Without it a count with no matching category renders nothing.
      if (typeof categories.other !== 'string') {
        problems.push({ key, reason: 'missing the `other` category, which every language has and `t()` falls back to' });
        continue;
      }
      const nonString = Object.entries(categories).filter(([, v]) => typeof v !== 'string');
      if (nonString.length > 0) {
        problems.push({ key, reason: `plural categories must be strings: ${nonString.map(([c]) => c).join(', ')}` });
        continue;
      }
    }

    // THE ONE THAT MATTERS. A dropped placeholder throws nothing and renders a
    // sentence with a number missing from it.
    const expected = placeholdersIn(source);
    const actual = placeholdersIn(value as Message);
    const dropped = expected.filter((p) => !actual.includes(p));
    const invented = actual.filter((p) => !expected.includes(p));

    if (dropped.length > 0 || invented.length > 0) {
      const parts: string[] = [];
      if (dropped.length > 0) parts.push(`dropped {${dropped.join('}, {')}}`);
      if (invented.length > 0) parts.push(`invented {${invented.join('}, {')}}`);
      problems.push({
        key,
        reason: `${parts.join(' and ')} — English declares {${expected.join('}, {')}}. A placeholder that is not reproduced renders a sentence with the value missing and raises no error.`,
      });
      continue;
    }

    catalog[key] = value as string | PluralMessage;
  }

  return { catalog: catalog as PartialCatalog, problems, accepted: Object.keys(catalog).length };
}
