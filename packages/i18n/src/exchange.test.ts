import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './catalog.js';
import { createTranslator } from './t.js';
import { exportSourceBundle, importTranslations, placeholdersIn } from './exchange.js';

/**
 * THE BOUNDARY, TESTED FOR WHAT IT REFUSES.
 *
 * The happy path here is trivial and proves almost nothing. What this module
 * exists for is the four ways an imported translation renders wrongly while
 * raising no error at all — so those are what the assertions are about.
 *
 * The sharpest is the dropped placeholder. `t()` throws when a CALLER forgets a
 * param, but a translation that removed `{amount}` from the message throws
 * nothing: it renders a confirmation with the number missing. Silent, plausible
 * and wrong.
 */

/** A key whose English message carries a placeholder, found rather than hardcoded. */
const keyWithPlaceholder = (Object.keys(en) as MessageKey[]).find((k) => {
  const m = en[k];
  return typeof m === 'string' && placeholdersIn(m).length > 0;
}) as MessageKey;

/** A key whose English message is count-dependent, if one exists. */
const pluralKey = (Object.keys(en) as MessageKey[]).find((k) => typeof en[k] !== 'string');

describe('exportSourceBundle', () => {
  it('emits every English key, so nobody has to decide what "needs" translating', () => {
    const bundle = exportSourceBundle();
    expect(bundle.sourceLocale).toBe('en');
    expect(bundle.units).toHaveLength(Object.keys(en).length);
  });

  it('carries the placeholders a translation must reproduce, extracted not documented', () => {
    const bundle = exportSourceBundle();
    const unit = bundle.units.find((u) => u.key === keyWithPlaceholder);

    expect(unit).toBeDefined();
    expect(unit?.placeholders.length).toBeGreaterThan(0);
    // Extracted from the string beside it, so the two cannot drift.
    expect(unit?.placeholders).toEqual(placeholdersIn(en[keyWithPlaceholder]));
  });
});

describe('importTranslations — what it refuses', () => {
  it('REFUSES a dropped placeholder, which would otherwise render a value-less sentence', () => {
    const source = en[keyWithPlaceholder] as string;
    const stripped = source.replace(/\{\w+\}/g, '').trim();

    const result = importTranslations({ [keyWithPlaceholder]: stripped });

    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.key).toBe(keyWithPlaceholder);
    expect(result.problems[0]?.reason).toContain('dropped');
  });

  it('REFUSES an invented placeholder, which renders as literal braces to a user', () => {
    const source = en[keyWithPlaceholder] as string;

    const result = importTranslations({ [keyWithPlaceholder]: `${source} {totallyMadeUp}` });

    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.reason).toContain('invented');
  });

  it('REFUSES a key English never declared — it could never render', () => {
    const result = importTranslations({ 'common.action.not_a_real_key': 'Hallo' });

    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.reason).toContain('never');
  });

  it('REFUSES a non-string value', () => {
    const result = importTranslations({ [keyWithPlaceholder]: 42 });
    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.reason).toContain('expected a string');
  });

  it('accepts a translation that keeps every placeholder, in any order', () => {
    const placeholders = placeholdersIn(en[keyWithPlaceholder]);
    // Deliberately not English word order — a translation is allowed to move
    // them, and refusing that would make the guard useless for real languages.
    const translated = `${placeholders.map((p) => `{${p}}`).join(' ')} — uebersetzt`;

    const result = importTranslations({ [keyWithPlaceholder]: translated });

    expect(result.problems).toHaveLength(0);
    expect(result.accepted).toBe(1);
  });

  it('treats a PARTIAL translation as normal, not as a problem', () => {
    // Languages land incomplete and catch up; `createTranslator` falls back to
    // English per key. A missing key must not read as an error.
    const result = importTranslations({ [keyWithPlaceholder]: en[keyWithPlaceholder] as string });

    expect(result.problems).toHaveLength(0);
    expect(Object.keys(result.catalog).length).toBeLessThan(Object.keys(en).length);
  });

  it('reports EVERY bad key, not just the first', () => {
    const result = importTranslations({
      'nope.one': 'x',
      'nope.two': 'y',
      [keyWithPlaceholder]: 123,
    });

    expect(result.problems).toHaveLength(3);
    expect(result.accepted).toBe(0);
  });

  it('what survives the import actually renders through t()', () => {
    // The end-to-end claim: an accepted catalog is usable, not merely well-shaped.
    const placeholders = placeholdersIn(en[keyWithPlaceholder]);
    const translated = `X ${placeholders.map((p) => `{${p}}`).join(' ')}`;
    const { catalog } = importTranslations({ [keyWithPlaceholder]: translated });

    const translator = createTranslator('en', catalog);
    const params = Object.fromEntries(placeholders.map((p) => [p, 'V']));
    const rendered = translator.tUnsafe(keyWithPlaceholder, params);

    expect(rendered).toContain('X');
    // No unsubstituted braces: every placeholder the import insisted on is one
    // `t()` could actually fill.
    expect(rendered).not.toContain('{');
  });
});

describe.runIf(pluralKey !== undefined)('importTranslations — plurals', () => {
  it('REFUSES a plural collapsed into one string', () => {
    const result = importTranslations({ [pluralKey as string]: 'one size fits all' });

    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.reason).toContain('count-dependent');
  });

  it('REFUSES a plural with no `other`, the category every language has', () => {
    const result = importTranslations({ [pluralKey as string]: { one: 'eins' } });

    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.reason).toContain('other');
  });

  it('REFUSES an invented CLDR category', () => {
    const result = importTranslations({ [pluralKey as string]: { other: 'viele', loads: 'x' } });

    expect(result.accepted).toBe(0);
    expect(result.problems[0]?.reason).toContain('unknown plural category');
  });
});
