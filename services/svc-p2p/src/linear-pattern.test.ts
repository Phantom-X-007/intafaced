import { describe, expect, it } from 'vitest';
import { LinearPattern, PatternError, MAX_NFA_STATES } from './linear-pattern.js';

/**
 * THE ENGINE THAT REPLACED `RegExp` FOR OPERATOR PATTERNS.
 *
 * Two things have to be true of it, and they pull against each other:
 *
 *   1. it must not be able to take exponential time — that is why it exists;
 *   2. it must mean the same thing as the engine it replaced, or every method
 *      schema an operator already reasoned about silently changes meaning.
 *
 * The second is the one that needs the most tests, so most of this file is a
 * DIFFERENTIAL comparison against JavaScript's own engine: for every pattern
 * this one accepts, both must give the same answer on every probe. Anything
 * this engine accepts that `RegExp` would reject is a divergence too, and is
 * asserted against directly — the accepted language is deliberately a SUBSET.
 */

/** The whole-value form `validateDetails` used to build, for comparison only. */
function jsWhole(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    return null;
  }
}

describe('the reason this engine exists', () => {
  /**
   * Under `RegExp`, `(a+)+b` against 33 characters took 24,674 ms and doubled
   * with every character. Product property (not wall-clock): compile stays
   * within MAX_NFA_STATES and the match returns the correct answer. CI timing
   * budgets flaked under load (STOP §4.2c) with no engine regression.
   */
  it('runs the payload that blocked the event loop, and answers correctly', () => {
    const evil = LinearPattern.compile('(a+)+b');
    expect(evil.stateCount).toBeLessThanOrEqual(MAX_NFA_STATES);
    expect(evil.test('a'.repeat(33))).toBe(false);
  });

  /**
   * Cap-length input: old engine would never return. Assert completion +
   * correct refuse + bounded automaton — not a ms budget.
   */
  it('is bounded by the value cap, not defeated by it', () => {
    const input = 'a'.repeat(512);

    for (const source of ['(a+)+b', '(a|a)*b', '(x+x+)+y', '([a-z]+)*$', '(a*)*b']) {
      const p = LinearPattern.compile(source);
      expect(p.stateCount).toBeLessThanOrEqual(MAX_NFA_STATES);
      const probe = source.includes('x') ? 'x'.repeat(512) : input;
      // Completes with a boolean. Match result is pattern-dependent (`*` can
      // match a run of letters); the product property is no exponential hang.
      expect(typeof p.test(probe), source).toBe('boolean');
    }
  });

  it('bounds the worst automaton the caps allow', () => {
    // Nested optionals keep the largest number of states simultaneously live.
    const worst = LinearPattern.compile('(?:a?a?a?a?a?a?a?a?a?a?){60}');
    expect(worst.stateCount).toBeLessThanOrEqual(MAX_NFA_STATES);
    // Completes with a boolean — no wall-clock (prior 250ms/2s budgets flaked).
    expect(typeof worst.test('a'.repeat(512))).toBe('boolean');
  });

  it('refuses an automaton bigger than the budget rather than building it', () => {
    // `{n,m}` is expanded, so a 14-character pattern can ask for a million
    // states. The refusal has to happen while it is being built.
    expect(() => LinearPattern.compile('(a{100}){100}')).toThrow(PatternError);
    expect(() => LinearPattern.compile('a{1001}')).toThrow(/repetition count above/);
    expect(() => LinearPattern.compile('(?:(?:(?:a{50}){50}){50}){50}')).toThrow(PatternError);
  });
});

describe('it means what RegExp means', () => {
  const PATTERNS = [
    'a',
    'abc',
    'a|b',
    'a|b|c',
    '(a|b)c',
    'a*',
    'a+',
    'a?',
    'a{2}',
    'a{2,}',
    'a{2,4}',
    'a{0,3}',
    '[abc]',
    '[^abc]',
    '[a-z]',
    '[a-z0-9_]',
    '[a-]',
    '[-a]',
    '[]',
    '[^]',
    '[\\d]',
    '[\\d.]',
    '[\\w-]',
    // The negated-shorthand-in-class family. The header used to record this as a
    // single refusal, `[\D]`; in fact the whole family was refused, `[\s\S]`
    // included — which is how JavaScript spells "any character, newline too".
    '[\\s\\S]',
    '[\\d\\D]',
    '[\\w\\W]',
    '[\\S]',
    '[\\W]',
    '[\\D]',
    '[^\\S]',
    '[^\\D]',
    '[a\\S]',
    '[\\S ]',
    '[\\D0]',
    '[^\\d\\D]',
    '[\\Sa-z]',
    // A literal brace is still spellable — deliberately, rather than by accident.
    '\\{',
    '\\}',
    '\\{2\\}',
    '[{}]',
    '[{]a[}]',
    '\\d+',
    '\\d{4}',
    '\\w+',
    '\\s',
    '\\S+',
    '\\D',
    '\\W',
    '.',
    '.+',
    '.*',
    'a.c',
    '^abc$',
    '^abc',
    'abc$',
    '^$',
    '\\$',
    '\\d+\\$',
    '^\\d+\\$',
    '\\.',
    '\\\\',
    '\\(x\\)',
    '\\[x\\]',
    '(a+)+b',
    '(a|a)*b',
    '(?:ab)+',
    '(?:a|b)*c',
    '((a)(b))+',
    '[0-9]{4}',
    '[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}',
    'a(b|)c',
    '(|a)b',
    'x{0,2}y',
    '(ab|cd){2,3}',
    '\\u0041',
    '\\u{1F600}',
    '\\x41',
    '\\t',
    'a|',
    '|a',
    '(a)(b)(c)',
    '[\\]]',
    '\\d*\\.?\\d+',
    '[+-]?[0-9]+(\\.[0-9]{1,2})?',
    '(?:^)*',
  ];

  const PROBES = [
    '',
    'a',
    'b',
    'ab',
    'abc',
    'aabc',
    'aaa',
    'ba',
    'A',
    'AB',
    '0',
    '0000',
    '1234',
    '12345',
    'a-b',
    '-',
    '_',
    '.',
    '$',
    '12$',
    'x',
    'xxy',
    'cd',
    'abcd',
    ' ',
    '\t',
    // The whitespace JS `\s` includes and RE2's does not. These are the probes
    // that make `[\S]` / `[^\S]` / `[\s\S]` mean something: without them a
    // complement that got the Unicode spaces wrong would still look correct.
    '\v',
    '\f',
    '\r',
    '\n',
    ' ',
    '',
    '',
    '　',
    '﻿',
    '​',
    '{',
    '}',
    '{2}',
    '123{2}',
    'a b',
    'DE89370400440532013000',
    '\\',
    '(x)',
    '[x]',
    '\u{1F600}',
    '12.34',
    '-12.5',
    '+7',
    'a'.repeat(10),
  ];

  it('agrees with RegExp on every accepted pattern and every probe', () => {
    let checks = 0;

    for (const source of PATTERNS) {
      const linear = LinearPattern.compile(source);
      const js = jsWhole(source);

      // A pattern this engine accepts must be one RegExp accepts too. The
      // accepted language is a subset, never a superset — otherwise "we agree
      // with RegExp" is untestable exactly where it matters.
      expect(js, `accepted ${JSON.stringify(source)} but RegExp rejects it`).not.toBeNull();

      for (const probe of PROBES) {
        checks++;
        expect(linear.test(probe), `${JSON.stringify(source)} vs ${JSON.stringify(probe)}`).toBe(js!.test(probe));
      }
    }

    expect(checks).toBeGreaterThan(2_000);
  });

  it('agrees with RegExp on randomly generated patterns', () => {
    // A deterministic PRNG: a fuzz test that cannot be reproduced from a
    // failure message is a fuzz test nobody can act on.
    let seed = 12_345;
    const rnd = () => (seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

    const PIECES = ['a', 'b', '0', '.', '\\d', '\\w', '[ab]', '[^a]', '[0-9]', '\\.', '\\$', '(?:ab)', '(a|b)', '^', '$'];
    const QUANTS = ['', '', '', '*', '+', '?', '{2}', '{1,3}', '{0,2}', '{2,}'];
    const ALPHABET = 'ab01-_.$';

    let accepted = 0;
    let checks = 0;

    for (let i = 0; i < 1_500; i++) {
      let source = '';
      const n = 1 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.15) source += '|';
        source += pick(PIECES) + pick(QUANTS);
      }

      let linear: LinearPattern;
      try {
        linear = LinearPattern.compile(source);
      } catch (err) {
        expect(err).toBeInstanceOf(PatternError);
        continue;
      }
      accepted++;

      const js = jsWhole(source);
      expect(js, `accepted ${JSON.stringify(source)} but RegExp rejects it`).not.toBeNull();

      for (let k = 0; k < 8; k++) {
        let probe = '';
        const len = Math.floor(rnd() * 7);
        for (let j = 0; j < len; j++) probe += pick(ALPHABET.split(''));
        checks++;
        expect(linear.test(probe), `${JSON.stringify(source)} vs ${JSON.stringify(probe)}`).toBe(js!.test(probe));
      }
    }

    expect(accepted).toBeGreaterThan(500);
    expect(checks).toBeGreaterThan(4_000);
  });

  it('anchors the whole value, without rewriting the pattern', () => {
    // The property `anchored()` was there to provide. A half-anchored operator
    // pattern is not a validation.
    expect(LinearPattern.compile('[0-9]{4}').test('1234')).toBe(true);
    expect(LinearPattern.compile('[0-9]{4}').test('1234abcd')).toBe(false);
    expect(LinearPattern.compile('[0-9]{4}').test('ab1234')).toBe(false);

    // A pattern the operator anchored themselves means the same thing.
    expect(LinearPattern.compile('^[0-9]{4}$').test('1234')).toBe(true);
    expect(LinearPattern.compile('^[0-9]{4}$').test('x1234')).toBe(false);
  });
});

describe('the escaped dollar sign', () => {
  /**
   * THE PATTERN THAT USED TO BREAK EVERY USER'S FIRST SAVE.
   *
   * `\d+\$` — digits then a literal `$`, entirely plausible for a
   * currency-amount field. It compiled fine at registration, and then
   * `anchored()` stripped the trailing `$` without noticing the backslash in
   * front of it and built `/^(?:\d+\)$/u`, which is an unterminated group. A
   * raw `SyntaxError`, not an `InstrumentError`, at every save.
   */
  it('compiles, and matches a literal dollar sign', () => {
    for (const source of ['\\$', '\\d+\\$', '^\\d+\\$', '\\d+\\$$', '[0-9]+\\.[0-9]{2}\\$']) {
      const p = LinearPattern.compile(source);
      const js = jsWhole(source)!;
      for (const probe of ['', '$', '1$', '12$', '12', '12.50$', 'x$']) {
        expect(p.test(probe), `${JSON.stringify(source)} vs ${JSON.stringify(probe)}`).toBe(js.test(probe));
      }
    }

    expect(LinearPattern.compile('\\d+\\$').test('1234$')).toBe(true);
    expect(LinearPattern.compile('\\d+\\$').test('1234')).toBe(false);
  });

  it('still treats a bare trailing $ as the anchor it is', () => {
    // `\\$` is a literal; `$` is the assertion. Telling them apart is the whole
    // bug, so both directions are asserted.
    expect(LinearPattern.compile('\\d+$').test('1234')).toBe(true);
    expect(LinearPattern.compile('\\d+$').test('1234$')).toBe(false);
  });
});

describe('what it refuses, and why', () => {
  const UNSUPPORTED: Array<[string, RegExp]> = [
    ['(?=a)b', /lookahead/],
    ['(?!a)b', /lookahead/],
    ['(?<=a)b', /lookbehind/],
    ['(?<name>a)', /lookbehind or named group/],
    ['(a)\\1', /backreference/],
    ['\\k<n>', /named backreference/],
    ['\\bword', /word boundary/],
    ['a\\B', /word boundary/],
    ['\\p{L}+', /Unicode property/],
  ];

  it('names the construct rather than saying "invalid"', () => {
    // An operator who wrote a lookahead needs to be told it is a lookahead. A
    // generic "invalid regular expression" sends them hunting for a typo that
    // is not there.
    for (const [source, message] of UNSUPPORTED) {
      let thrown: unknown;
      try {
        LinearPattern.compile(source);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, source).toBeInstanceOf(PatternError);
      expect((thrown as PatternError).problem, source).toBe('unsupported');
      expect((thrown as PatternError).message, source).toMatch(message);
    }
  });

  it('never silently accepts an unsupported construct as literal text', () => {
    // The dangerous failure: matching `(?=a)` as the five characters `(?=a)`
    // would turn a validation the operator believes in into one that holds for
    // nothing. Refusing is the only safe answer.
    for (const [source] of UNSUPPORTED) {
      expect(() => LinearPattern.compile(source)).toThrow(PatternError);
    }
  });

  it('reports a syntax error as a syntax error', () => {
    for (const source of ['[unclosed', '(unclosed', 'unopened)', 'a**', 'a{2,1}', '[z-a]', '\\', '\\q', '*x', '^*', '$+']) {
      let thrown: unknown;
      try {
        LinearPattern.compile(source);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, source).toBeInstanceOf(PatternError);
      expect((thrown as PatternError).problem, source).toBe('syntax');
    }
  });
});

describe('the stray quantifier brace', () => {
  /**
   * THE PATTERN THAT MADE A PAYMENT METHOD UNUSABLE, SILENTLY.
   *
   * `tryBraceQuantifier` rewinds when a `{` is not a quantifier, and that rewind
   * used to fall through to the literal-character path. So a doubled quantifier
   * was accepted at registration and the second one became literal text.
   *
   * Every case below is a `SyntaxError` under `RegExp(…, 'u')`, so accepting it
   * made the language a SUPERSET of JS — the precise opposite of the property
   * this file's header claims and this suite exists to hold.
   */
  const STRAY = [
    '[0-9]{3}{2}', // the reported one: an operator asking for six digits
    'a{2}{3}',
    'a{2}{3}{4}',
    '{2}',
    '{',
    '}',
    'a{',
    'a}',
    '}a',
    'a{}',
    'a{,3}',
    'a{x}',
    '(ab){2}{2}',
    '[0-9]{4}}',
    'a*{2}',
    'a+{2}',
    'a?{2}',
    '\\d{2}{2}',
  ];

  it('refuses at registration what RegExp refuses at registration', () => {
    for (const source of STRAY) {
      // The claim is not a matter of taste — it is that JS rejects this too.
      // Asserting both halves keeps the test honest if JS ever changes.
      expect(jsWhole(source), `RegExp unexpectedly accepts ${JSON.stringify(source)}`).toBeNull();

      let thrown: unknown;
      try {
        LinearPattern.compile(source);
      } catch (err) {
        thrown = err;
      }
      expect(thrown, `accepted ${JSON.stringify(source)}, which RegExp rejects`).toBeInstanceOf(PatternError);
      expect((thrown as PatternError).problem, source).toBe('syntax');
    }
  });

  /**
   * The regression proof, stated as the consequence rather than as the parse.
   *
   * Before the fix `[0-9]{3}{2}` compiled and required the literal text
   * `123{2}` — six digits was what the operator meant, and nothing a user could
   * type would satisfy it, so the method failed at every first save instead of
   * at registration. This test fails on the old engine twice over: the compile
   * does not throw, and the value it accepts is that literal.
   */
  it('does not turn a doubled quantifier into literal text', () => {
    let accepted: LinearPattern | null = null;
    try {
      accepted = LinearPattern.compile('[0-9]{3}{2}');
    } catch {
      accepted = null;
    }
    expect(accepted, 'the old engine accepted this and matched the literal "123{2}"').toBeNull();

    // The same for the two other shapes the fuzz found.
    for (const [source, literal] of [
      ['{2}', '{2}'],
      ['a}', 'a}'],
    ] as const) {
      let p: LinearPattern | null = null;
      try {
        p = LinearPattern.compile(source);
      } catch {
        p = null;
      }
      expect(p, `${JSON.stringify(source)} must not compile to the literal ${JSON.stringify(literal)}`).toBeNull();
    }
  });

  it('still lets an operator write a literal brace on purpose', () => {
    // Refusing the accident must not remove the intent. `\{`, `\}` and a brace
    // inside a class all still mean the character.
    for (const source of ['\\{', '\\}', '\\{2\\}', '[{}]', 'a\\{2\\}b', '[{]x[}]']) {
      const p = LinearPattern.compile(source);
      const js = jsWhole(source);
      expect(js, source).not.toBeNull();
      for (const probe of ['', '{', '}', '{2}', 'a{2}b', '{x}', 'x']) {
        expect(p.test(probe), `${JSON.stringify(source)} vs ${JSON.stringify(probe)}`).toBe(js!.test(probe));
      }
    }
  });

  it('names the brace rather than saying "invalid"', () => {
    // Same rule as the unsupported constructs: an operator who typed one brace
    // too many needs to be told it was a brace.
    expect(() => LinearPattern.compile('{2}')).toThrow(/\{/);
    expect(() => LinearPattern.compile('a}')).toThrow(/\}/);
    expect(() => LinearPattern.compile('[0-9]{3}{2}')).toThrow(/quantifier applied to a quantifier/);
  });

  /**
   * THE FUZZ THAT WOULD HAVE CAUGHT IT.
   *
   * The corpus above missed this class for one reason: no entry contained a
   * stray brace. `QUANTS` here does, so the subset property is now checked
   * against patterns that can be malformed in the one way that used to slip
   * through.
   */
  it('is a subset of RegExp across patterns that contain stray braces', () => {
    let seed = 987_654;
    const rnd = () => (seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

    const PIECES = [
      'a',
      'b',
      '0',
      '.',
      '\\d',
      '\\w',
      '[ab]',
      '[^a]',
      '[0-9]',
      '\\.',
      '\\{',
      '\\}',
      '(?:ab)',
      '(a|b)',
      '^',
      '$',
      '[\\s\\S]',
    ];
    const QUANTS = ['', '', '', '*', '+', '?', '{2}', '{1,3}', '{2,}', '{2}{3}', '{', '}', '{}', '{,3}', '{2}{2}'];
    const ALPHABET = 'ab01-_.${}';

    let accepted = 0;
    let refused = 0;
    let checks = 0;

    for (let i = 0; i < 4_000; i++) {
      let source = '';
      const n = 1 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        if (rnd() < 0.15) source += '|';
        source += pick(PIECES) + pick(QUANTS);
      }

      let linear: LinearPattern;
      try {
        linear = LinearPattern.compile(source);
      } catch (err) {
        expect(err).toBeInstanceOf(PatternError);
        refused++;
        continue;
      }
      accepted++;

      // The property. Before the fix this failed 6,595 times in ~55,000.
      const js = jsWhole(source);
      expect(js, `accepted ${JSON.stringify(source)} but RegExp rejects it`).not.toBeNull();

      for (let k = 0; k < 6; k++) {
        let probe = '';
        const len = Math.floor(rnd() * 7);
        for (let j = 0; j < len; j++) probe += pick(ALPHABET.split(''));
        checks++;
        expect(linear.test(probe), `${JSON.stringify(source)} vs ${JSON.stringify(probe)}`).toBe(js!.test(probe));
      }
    }

    // Both sides have to be non-trivial: an all-refused corpus would satisfy the
    // subset assertion while proving nothing.
    expect(accepted).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(300);
    expect(checks).toBeGreaterThan(1_800);
  });
});

describe('a negated shorthand inside a character class', () => {
  /**
   * `[\s\S]` — how JavaScript spells "any character, newline included" — was
   * refused, along with the rest of its family. The header recorded that
   * refusal as `[\D]` alone, which is why it read as a curiosity rather than as
   * a missing idiom.
   *
   * Fail-closed, so it never corrupted a validation. But an operator whose
   * field genuinely accepts anything had no way to say so.
   */
  const FAMILY = [
    '[\\s\\S]',
    '[\\d\\D]',
    '[\\w\\W]',
    '[\\S]',
    '[\\W]',
    '[\\D]',
    '[^\\S]',
    '[^\\D]',
    '[^\\W]',
    '[a\\S]',
    '[\\S ]',
    '[\\D0]',
    '[^\\d\\D]',
    '[\\Sa-z]',
    '[^\\Sa-z]',
    '[\\s\\S\\s\\S]',
  ];

  /** Every whitespace JS knows, plus the boundaries of each shorthand. */
  const CHARS = [
    '\t',
    '\n',
    '\v',
    '\f',
    '\r',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    '　',
    '﻿',
    '​',
    '0',
    '9',
    '/',
    ':',
    'A',
    'Z',
    '_',
    'a',
    'z',
    '@',
    '[',
    '`',
    '{',
    '}',
    '-',
    '.',
    'é',
    '中',
    '\u{1F600}',
  ];

  it('means exactly what RegExp means, character for character', () => {
    let checks = 0;

    for (const cls of FAMILY) {
      for (const suffix of ['', '+', '{2}']) {
        const source = cls + suffix;
        const js = jsWhole(source);
        expect(js, source).not.toBeNull();

        const linear = LinearPattern.compile(source);
        for (const a of CHARS) {
          for (const b of ['', ...CHARS.slice(0, 10)]) {
            const probe = a + b;
            checks++;
            expect(linear.test(probe), `${JSON.stringify(source)} vs ${JSON.stringify(probe)}`).toBe(js!.test(probe));
          }
        }
      }
    }

    expect(checks).toBeGreaterThan(15_000);
  });

  it('composes with an outer negation', () => {
    // `[^\S]` is "not (not whitespace)" = whitespace. Getting this wrong is the
    // obvious way to implement the complement, and it would still pass `[\S]`.
    const ws = LinearPattern.compile('[^\\S]');
    for (const c of ['\t', '\n', ' ', ' ', '　']) expect(ws.test(c), JSON.stringify(c)).toBe(true);
    for (const c of ['a', '0', '_', '​']) expect(ws.test(c), JSON.stringify(c)).toBe(false);

    // `[\d\D]` is everything, and `[^\d\D]` is the empty set.
    expect(LinearPattern.compile('[\\d\\D]').test('\n')).toBe(true);
    for (const c of ['', 'a', '0', '\n']) expect(LinearPattern.compile('[^\\d\\D]').test(c)).toBe(false);
  });

  it('stays cheap — a folded complement is still one instruction', () => {
    // The complement of `\s` is eleven ranges, and `inSet` is a linear scan, so
    // an un-coalesced union would multiply the per-character cost by the number
    // of times the shorthand appears. `normaliseRanges` is what stops that.
    // Assert bounded state count + completion — not wall-clock ms.
    const wide = LinearPattern.compile(`[${'\\S'.repeat(60)}]{200}`);
    expect(wide.stateCount).toBeLessThanOrEqual(MAX_NFA_STATES);
    expect(typeof wide.test('a'.repeat(512))).toBe('boolean');
  });
});
