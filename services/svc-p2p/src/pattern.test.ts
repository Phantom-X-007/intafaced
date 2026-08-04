import { describe, expect, it } from 'vitest';
import { MAX_NFA_STATES, MAX_REPEAT, PatternError, compilePattern } from './pattern.js';

/**
 * THE MEASUREMENT THIS FILE EXISTS FOR.
 *
 * The claimed mitigation for operator-supplied patterns used to be four caps —
 * pattern ≤ 200 chars, compile-checked at registration, value ≤ 512 chars, and
 * the supplier holds `admin:compliance`. All four are true and none of them
 * bounds runtime: `(a+)+b` is six characters, compiles cleanly, and 29
 * characters of input blocked the event loop for 8.9 seconds.
 *
 * "The operator is trusted" is not a control either. One bad paste, or one
 * compromised operator session, is a platform-wide denial of service on a
 * single-threaded runtime — and svc-p2p's settlement sweep runs in that same
 * process, so the blast radius includes escrow that cannot settle.
 *
 * So the control is the ALGORITHM. These tests assert the bound, not the
 * caps.
 */

/** Wall-clock, deliberately: the property under test is time, not output. */
function millisFor(fn: () => void): number {
  const at = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - at) / 1e6;
}

describe('the catastrophic patterns', () => {
  /**
   * THE HEADLINE. If this regresses, the fix is gone.
   *
   * The budget is generous on purpose — it is not a benchmark, it is the
   * difference between microseconds and "the process stopped". `RegExp` needs
   * roughly 2^n for n `a`s here; at n = 40 that is a number with twelve digits
   * in it, and the test would not finish.
   */
  it('matches (a+)+b in linear time where RegExp needs exponential', () => {
    const compiled = compilePattern('(a+)+b');
    const evil = 'a'.repeat(40);

    const ms = millisFor(() => {
      expect(compiled.test(evil)).toBe(false);
    });
    expect(ms).toBeLessThan(250);

    // Still the same language. A linear matcher that got the ANSWER wrong
    // would be a worse bug than a slow one.
    expect(compiled.test('aaab')).toBe(true);
    expect(compiled.test('b')).toBe(false);
  });

  it.each([
    ['(a+)+b', 'a'.repeat(60)],
    ['(a|a)*b', 'a'.repeat(60)],
    ['(a*)*b', 'a'.repeat(60)],
    ['(x+x+)+y', 'x'.repeat(60)],
    ['(\\d+)+$', '1'.repeat(60) + 'x'],
    ['^(a|ab)*c', 'ab'.repeat(30)],
  ])('survives %s', (pattern, input) => {
    const compiled = compilePattern(pattern);
    const ms = millisFor(() => {
      compiled.test(input);
    });
    expect(ms).toBeLessThan(250);
  });

  it('stays linear as the input grows — the shape of the curve, not one point', () => {
    const compiled = compilePattern('(a+)+b');
    const short = millisFor(() => compiled.test('a'.repeat(200)));
    const long = millisFor(() => compiled.test('a'.repeat(2_000)));

    // Ten times the input, nowhere near ten times squared. Loose, because a
    // millisecond timer on a loaded machine is loose; the exponential case
    // would not finish at all.
    expect(long).toBeLessThan(Math.max(short, 1) * 100);
  });
});

describe('it is still a regular expression engine', () => {
  /**
   * Cross-checked against `RegExp` itself, on the subset both support. A
   * hand-rolled matcher whose answers drift from the platform's would turn a
   * denial-of-service fix into a validation that accepts the wrong accounts.
   */
  const cases: Array<[string, string[]]> = [
    ['[A-Z]{2}\\d{2}[A-Z0-9]{4,30}', ['DE89370400440532013000', 'GB29NWBK60161331926819', 'de89370400440532013000', '', 'DE8']],
    ['\\+?[0-9 ()-]{6,20}', ['+44 20 7946 0958', '020 7946 0958', 'not a number', '']],
    ['[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}', ['a.b@example.com', 'a@b', '@example.com']],
    ['(?:cash|bank|mobile)-[a-z]+', ['bank-transfer', 'cash-pickup', 'wire-transfer']],
    ['\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?', ['1,234,567.89', '999', '1,23', '']],
    ['[^\\s]{4,}', ['abcd', 'ab cd', 'abc']],
    ['a{0,3}b', ['b', 'ab', 'aaab', 'aaaab']],
    ['(ab)+', ['ababab', 'aba', '']],
    ['x|', ['x', '']],
    ['\\$\\d+', ['$5', '5']],
  ];

  it.each(cases)('agrees with RegExp on %s', (pattern, inputs) => {
    const compiled = compilePattern(pattern);
    const native = new RegExp(`^(?:${pattern})$`, 'u');
    for (const input of inputs) {
      expect(compiled.test(input), `${pattern} vs ${JSON.stringify(input)}`).toBe(native.test(input));
    }
  });

  it('matches whole values only — a half-anchored operator pattern is not a validation', () => {
    const compiled = compilePattern('\\d{4}');
    expect(compiled.test('1234')).toBe(true);
    expect(compiled.test('1234x')).toBe(false);
    expect(compiled.test('x1234')).toBe(false);
  });

  it('reads code points, not UTF-16 units', () => {
    // A `.` that matched half of an astral character would silently change what
    // a pattern means for anyone whose account identifiers are not ASCII.
    expect(compilePattern('.').test('😀')).toBe(true);
    expect(compilePattern('.{2}').test('😀')).toBe(false);
    expect(compilePattern('[\\u{1F600}-\\u{1F64F}]+').test('😀😀')).toBe(true);
  });
});

describe('THE ANCHORING BUG', () => {
  /**
   * The defect this replaces, reproduced as the pattern that caused it.
   *
   * Registration checked `new RegExp(pattern, 'u')`. Validation ran
   * `anchored(pattern)`, which did `pattern.replace(/^\^/, '').replace(/\$$/,
   * '')` — naive string surgery that does not know an escaped `\$` from an end
   * anchor. A currency field's `^\$\d+$` therefore registered cleanly and threw
   * a raw SyntaxError on every user's first save.
   *
   * There is one compiler now, and anchoring is a property of the match rather
   * than a rewrite of the source, so the two forms cannot disagree.
   */
  it('accepts a pattern ending in an escaped dollar and still matches it', () => {
    const compiled = compilePattern('^\\d+\\$$');
    expect(compiled.test('5$')).toBe(true);
    expect(compiled.test('5')).toBe(false);
  });

  it('treats a leading ^ and a trailing $ as the no-ops they are', () => {
    expect(compilePattern('^abc$').test('abc')).toBe(true);
    expect(compilePattern('^abc$').test('xabc')).toBe(false);
  });

  it('refuses an anchor in the middle rather than guessing what it meant', () => {
    expect(() => compilePattern('a$b')).toThrow(PatternError);
    expect(() => compilePattern('a^b')).toThrow(PatternError);
  });
});

describe('what it refuses, and why refusing is the honest answer', () => {
  /**
   * Backreferences and lookaround are not regular languages. There is no NFA
   * for them, and every engine that offers them is a backtracker with exactly
   * the worst case this file exists to remove. Refused at registration, in
   * front of the operator — never accepted and quietly routed to a second,
   * unsafe matcher, which would mean the guarantee held for the patterns
   * nobody worried about and lapsed for the ones they did.
   */
  it.each([
    ['(a)\\1', 'backreference'],
    ['(?=a)b', 'lookahead'],
    ['(?!a)b', 'negative lookahead'],
    ['(?<=a)b', 'lookbehind'],
    ['\\bword\\b', 'word boundary'],
    ['\\p{L}+', 'unicode property escape'],
    ['(?<name>a)', 'named group'],
  ])('refuses %s (%s)', (pattern) => {
    expect(() => compilePattern(pattern)).toThrow(PatternError);
  });

  it('says WHY, so an operator can fix it rather than guess', () => {
    expect(() => compilePattern('(a)\\1')).toThrow(/not regular|backreference/i);
    expect(() => compilePattern('(?=a)b')).toThrow(/Lookahead|backtracking/i);
  });

  it.each([['(a'], ['a)'], ['['], ['[]'], ['a{2,1}'], ['*a'], ['a\\']])('refuses the malformed pattern %s', (pattern) => {
    expect(() => compilePattern(pattern)).toThrow(PatternError);
  });
});

describe('the bound is a bound', () => {
  /**
   * Match time is O(states × value length). Both halves are capped, so the
   * product is capped — which is the entire claim. A pattern that would compile
   * past the ceiling is refused rather than admitted at an unknown cost.
   */
  it('refuses a pattern that expands past the state ceiling', () => {
    expect(() => compilePattern(`(?:abcdefghij){${MAX_REPEAT}}`.repeat(3))).toThrow(PatternError);
  });

  it('refuses a repetition count above the expansion cap', () => {
    expect(() => compilePattern(`a{${MAX_REPEAT + 1}}`)).toThrow(/Repetition above/);
  });

  it('reports how big a pattern actually got, so the ceiling is inspectable', () => {
    const compiled = compilePattern('[A-Z]{2}\\d{2}[A-Z0-9]{4,30}');
    expect(compiled.states).toBeGreaterThan(0);
    expect(compiled.states).toBeLessThanOrEqual(MAX_NFA_STATES);
  });

  it('does not blow the stack on a long epsilon chain', () => {
    // The state-set walk is iterative. A recursive closure would overflow here,
    // and a stack overflow inside a validator is only a faster way to fall over.
    const compiled = compilePattern('a?'.repeat(400));
    expect(compiled.test('')).toBe(true);
    expect(compiled.test('a'.repeat(400))).toBe(true);
  });
});
