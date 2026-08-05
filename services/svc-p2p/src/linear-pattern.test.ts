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

function elapsed(fn: () => void): number {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

describe('the reason this engine exists', () => {
  /**
   * The measured fact, as a test.
   *
   * Under `RegExp`, `(a+)+b` against 33 characters took 24,674 ms on the machine
   * this was written on, doubling with every additional character — and
   * `MAX_VALUE_LENGTH` permits 512. The budget below is three orders of
   * magnitude below that, so this fails on any machine rather than being a
   * property of a fast one.
   */
  it('runs the payload that blocked the event loop, in under a millisecond', () => {
    const evil = LinearPattern.compile('(a+)+b');
    const input = 'a'.repeat(33);

    let matched = true;
    const ms = elapsed(() => {
      matched = evil.test(input);
    });

    expect(matched).toBe(false);
    expect(ms).toBeLessThan(50);
  });

  /**
   * The same payload at the LENGTH CAP.
   *
   * This is the test that says the cap is finally a bound on work: 512 is what
   * `MAX_VALUE_LENGTH` allows, and under the old engine this call would not
   * have returned in the lifetime of the universe. It is separated from the
   * test above because that one is the revert-proof — it completes under the
   * old engine (in ~25 seconds) and fails the budget, whereas this one would
   * simply never return.
   */
  it('is bounded by the value cap, not defeated by it', () => {
    const input = 'a'.repeat(512);

    for (const source of ['(a+)+b', '(a|a)*b', '(x+x+)+y', '([a-z]+)*$', '(a*)*b']) {
      const p = LinearPattern.compile(source);
      const probe = source.includes('x') ? 'x'.repeat(512) : input;
      const ms = elapsed(() => p.test(probe));
      expect(ms).toBeLessThan(100);
    }
  });

  it('bounds the worst automaton the caps allow', () => {
    // Nested optionals keep the largest number of states simultaneously live,
    // which is the actual worst case for a set-simulation — not the nested
    // quantifiers that break a backtracking engine.
    const worst = LinearPattern.compile('(?:a?a?a?a?a?a?a?a?a?a?){60}');
    expect(worst.stateCount).toBeLessThanOrEqual(MAX_NFA_STATES);

    const ms = elapsed(() => worst.test('a'.repeat(512)));

    /**
     * WHY THIS CEILING IS LOOSE, AND WHY IT IS STILL A TEST.
     *
     * This budget was 250 ms and it flaked on CI at 263.7 ms — a red build that
     * said nothing about the engine. This is the only case in the file that does
     * the full `MAX_NFA_STATES × MAX_VALUE_LENGTH` of work: ~2,000 states against
     * 512 characters is on the order of a million state visits, and a shared
     * runner with a cold JIT is several times slower than the machine a
     * threshold gets written on.
     *
     * The property under test is NOT "this takes under X ms on this laptop" —
     * that is unmeasurable in CI and gets tightened back to flaky by the next
     * person who runs it locally. It is "the worst input the caps permit
     * completes at all, in time bounded by the automaton rather than by the
     * input's shape". `RegExp` on the payload in the test above took 24,674 ms
     * against 33 characters, and against these 512 would not return. Two orders
     * of magnitude of headroom still fails instantly if the simulation ever
     * stops being linear, which is the only regression this can catch.
     *
     * The tight budgets live on the two tests above (50 ms and 100 ms), where
     * the work is small enough for the number to mean something.
     */
    expect(ms).toBeLessThan(2_000);
  });

  it('refuses an automaton bigger than the budget rather than building it', () => {
    // `{n,m}` is expanded, so a 14-character pattern can ask for a million
    // states. The refusal has to happen while it is being built.
    expect(() => LinearPattern.compile('(a{100}){100}')).toThrow(PatternError);
    expect(() => LinearPattern.compile('a{1001}')).toThrow(/repetition count above/);

    const ms = elapsed(() => {
      try {
        LinearPattern.compile('(?:(?:(?:a{50}){50}){50}){50}');
      } catch {
        /* expected */
      }
    });
    expect(ms).toBeLessThan(250);
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
