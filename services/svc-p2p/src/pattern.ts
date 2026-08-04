/**
 * OPERATOR PATTERNS, MATCHED IN LINEAR TIME (§6.2 payment instruments).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * A method schema lets an operator say what a field must look like — an IBAN,
 * a mobile-money handle, a sort code — as a regular expression. That is the
 * right shape for the feature: what a market's rails require is not this
 * repo's knowledge to invent, so it has to be data.
 *
 * It also means an operator-supplied pattern runs against a value that came
 * from the internet, and `RegExp` backtracks. The mitigation used to be four
 * caps — pattern ≤ 200 chars, compile-checked at registration, value ≤ 512
 * chars, and the supplier holds `admin:compliance` — and the measured fact is
 * that none of them bound runtime:
 *
 *     (a+)+b   is six characters, compiles cleanly, and 29 characters of
 *              input blocked the event loop for 8.9 seconds.
 *
 * A length cap is not a mitigation for exponential backtracking, and "the
 * operator is trusted" is not a control: one bad paste, or one compromised
 * operator session, is a platform-wide denial of service on a single-threaded
 * runtime. Every service in the process — escrow settlement included — stops.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES INSTEAD
 *
 * It does not use `RegExp` at match time at all. A pattern is parsed once,
 * compiled to a Thompson NFA, and matched by simulating the NFA over the input
 * with a set of active states. That simulation:
 *
 *   · never backtracks, because it follows every alternative at once;
 *   · visits each (state, input position) pair at most once, so the cost is
 *     O(states × input length) — a bound that comes from the algorithm rather
 *     than from hoping the pattern is nice;
 *   · is bounded absolutely, because both factors are capped here
 *     (`MAX_NFA_STATES` × `MAX_VALUE_LENGTH`).
 *
 * `(a+)+b` against 10,000 `a`s is linear in this engine. It is the same answer
 * `RegExp` would give — this is not a different language, it is the same
 * language matched by a different algorithm — it just cannot take exponential
 * time to give it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SUBSET, AND WHY REJECTING THE REST IS HONEST
 *
 * Backreferences and lookaround are not regular. They cannot be compiled to an
 * NFA, and any engine that supports them is a backtracker with the same worst
 * case. They are REFUSED AT REGISTRATION with a message that says so, rather
 * than accepted and matched by a second, unsafe path — a fallback would mean
 * the guarantee held for the patterns nobody worried about and lapsed for the
 * ones they did.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE COMPILER, TWO CALLERS — which also closes a real bug.
 *
 * Registration used to check `new RegExp(pattern, 'u')` while validation ran
 * `anchored(pattern)`, which stripped a leading `^` and a trailing `$` by naive
 * string surgery. A pattern ending in an ESCAPED `\$` — entirely plausible for
 * a currency field — therefore passed registration and threw a raw
 * `SyntaxError` at validation: a 500 on every user's first save, and precisely
 * the failure the compile check existed to prevent.
 *
 * There is no second form here. `compilePattern` is the only way a pattern
 * becomes a matcher, anchoring is a property of the MATCH (the NFA must reach
 * its accept state having consumed the whole value) rather than a rewrite of
 * the source, and both callers run the same function on the same string. The
 * class of bug is gone, not fixed.
 */

/** Absolute ceiling on compiled size. Half of the O(states × length) bound. */
export const MAX_NFA_STATES = 2_000;

/** `{n,m}` is expanded, so the ceiling above needs a ceiling on m too. */
export const MAX_REPEAT = 100;

export class PatternError extends Error {
  constructor(
    message: string,
    /** Zero-based index into the pattern, when the answer is one place. */
    readonly at?: number,
  ) {
    super(message);
    this.name = 'PatternError';
  }
}

/** A compiled pattern. The only thing `instruments.ts` is given. */
export interface CompiledPattern {
  readonly source: string;
  readonly states: number;
  /** True when the WHOLE value is matched. There is no partial-match mode. */
  test(value: string): boolean;
}

// ── The AST ──────────────────────────────────────────────────────────────────

type CharTest = (cp: number) => boolean;

type Ast =
  | { k: 'empty' }
  | { k: 'char'; test: CharTest }
  | { k: 'cat'; xs: Ast[] }
  | { k: 'alt'; xs: Ast[] }
  | { k: 'rep'; x: Ast; min: number; max: number | null };

// ── The parser ───────────────────────────────────────────────────────────────

/**
 * A recursive-descent parser over CODE POINTS, not UTF-16 units.
 *
 * The patterns this replaces were compiled with the `u` flag, and account
 * identifiers in a lot of the world are not ASCII. Iterating UTF-16 units would
 * split an astral character in half and silently change what a pattern means.
 */
class Parser {
  private readonly cps: number[];
  private i = 0;

  constructor(private readonly src: string) {
    this.cps = Array.from(src, (c) => c.codePointAt(0)!);
  }

  parse(): Ast {
    // `^` at the very start and `$` at the very end are no-ops: this engine
    // always matches the whole value, so an operator who anchored their pattern
    // by hand gets what they meant. Anywhere ELSE they are refused rather than
    // quietly treated as literals — a `$` in the middle of a pattern means the
    // author expected multi-part matching, and guessing which they wanted is
    // how a validation silently stops validating.
    if (this.peek() === 0x5e) this.i++; // '^'
    const ast = this.alternation();
    if (this.i < this.cps.length) {
      throw new PatternError(`Unexpected "${this.charAt(this.i)}" at position ${this.i}`, this.i);
    }
    return ast;
  }

  private peek(): number | undefined {
    return this.cps[this.i];
  }

  private charAt(i: number): string {
    const cp = this.cps[i];
    return cp === undefined ? '' : String.fromCodePoint(cp);
  }

  private alternation(): Ast {
    const branches: Ast[] = [this.concatenation()];
    while (this.peek() === 0x7c) {
      // '|'
      this.i++;
      branches.push(this.concatenation());
    }
    return branches.length === 1 ? branches[0]! : { k: 'alt', xs: branches };
  }

  private concatenation(): Ast {
    const parts: Ast[] = [];
    for (;;) {
      const cp = this.peek();
      if (cp === undefined || cp === 0x7c /* | */ || cp === 0x29 /* ) */) break;
      parts.push(this.quantified());
    }
    if (parts.length === 0) return { k: 'empty' };
    return parts.length === 1 ? parts[0]! : { k: 'cat', xs: parts };
  }

  private quantified(): Ast {
    let atom = this.atom();
    for (;;) {
      const cp = this.peek();
      if (cp === 0x2a) {
        // '*'
        this.i++;
        atom = { k: 'rep', x: atom, min: 0, max: null };
      } else if (cp === 0x2b) {
        // '+'
        this.i++;
        atom = { k: 'rep', x: atom, min: 1, max: null };
      } else if (cp === 0x3f) {
        // '?'
        this.i++;
        atom = { k: 'rep', x: atom, min: 0, max: 1 };
      } else if (cp === 0x7b) {
        // '{'
        const bounds = this.tryBraceQuantifier();
        if (!bounds) break;
        atom = { k: 'rep', x: atom, min: bounds.min, max: bounds.max };
      } else {
        break;
      }
      // Lazy and possessive markers change WHICH match is found, never WHETHER
      // one exists — and this engine only ever answers "does the whole value
      // match". Accepted and ignored, so an operator's `\d+?` is not refused
      // for a distinction that cannot apply.
      if (this.peek() === 0x3f || this.peek() === 0x2b) {
        const prev = this.cps[this.i - 1];
        if (prev === 0x2a || prev === 0x2b || prev === 0x3f || prev === 0x7d) this.i++;
      }
    }
    return atom;
  }

  /** `{n}` `{n,}` `{n,m}`. A `{` that is not one of those is a literal brace. */
  private tryBraceQuantifier(): { min: number; max: number | null } | null {
    const start = this.i;
    this.i++; // '{'
    const min = this.digits();
    if (min === null) {
      this.i = start;
      return null;
    }
    let max: number | null = min;
    if (this.peek() === 0x2c) {
      // ','
      this.i++;
      max = this.digits();
    }
    if (this.peek() !== 0x7d) {
      this.i = start;
      return null;
    }
    this.i++; // '}'

    if (max !== null && max < min) {
      throw new PatternError(`Repetition {${min},${max}} counts down`, start);
    }
    if (min > MAX_REPEAT || (max !== null && max > MAX_REPEAT)) {
      throw new PatternError(
        `Repetition above ${MAX_REPEAT} is refused — it is expanded, and the expansion is what bounds match time`,
        start,
      );
    }
    return { min, max };
  }

  private digits(): number | null {
    const start = this.i;
    let n = 0;
    while (this.peek() !== undefined && this.peek()! >= 0x30 && this.peek()! <= 0x39) {
      n = n * 10 + (this.peek()! - 0x30);
      this.i++;
      if (n > 100_000) throw new PatternError('Repetition count is absurd', start);
    }
    return this.i === start ? null : n;
  }

  private atom(): Ast {
    const cp = this.peek();
    if (cp === undefined) throw new PatternError('Pattern ends where an expression was expected', this.i);

    if (cp === 0x28) return this.group();
    if (cp === 0x5b) return this.charClass();
    if (cp === 0x5c) return this.escape();

    if (cp === 0x2e) {
      // '.' — every code point except a line terminator, as `RegExp` has it.
      this.i++;
      return { k: 'char', test: (c) => c !== 0x0a && c !== 0x0d && c !== 0x2028 && c !== 0x2029 };
    }

    if (cp === 0x24) {
      // '$' — only meaningful at the very end, where it is a no-op.
      if (this.i === this.cps.length - 1) {
        this.i++;
        return { k: 'empty' };
      }
      throw new PatternError('"$" is only allowed at the end of a pattern — the whole value is always matched', this.i);
    }
    if (cp === 0x5e) {
      throw new PatternError('"^" is only allowed at the start of a pattern — the whole value is always matched', this.i);
    }
    if (cp === 0x2a || cp === 0x2b || cp === 0x3f) {
      throw new PatternError(`"${this.charAt(this.i)}" has nothing to repeat`, this.i);
    }

    this.i++;
    return { k: 'char', test: (c) => c === cp };
  }

  private group(): Ast {
    const start = this.i;
    this.i++; // '('
    if (this.peek() === 0x3f) {
      // '?'
      const next = this.cps[this.i + 1];
      // `(?:` is the only prefixed group form this engine can compile.
      // Lookahead, lookbehind and named backreference targets are NOT regular
      // languages; there is no NFA for them, and the only engines that offer
      // them are backtrackers with the worst case this file exists to remove.
      if (next === 0x3a) {
        this.i += 2;
      } else {
        throw new PatternError(
          'Lookahead, lookbehind and named groups are refused: they cannot be matched without backtracking, ' +
            'which is the exact cost this validator exists to avoid. Use a plain or (?:…) group.',
          start,
        );
      }
    }
    const inner = this.alternation();
    if (this.peek() !== 0x29) throw new PatternError('Unclosed group', start);
    this.i++; // ')'
    return inner;
  }

  private charClass(): Ast {
    const start = this.i;
    this.i++; // '['
    let negate = false;
    if (this.peek() === 0x5e) {
      negate = true;
      this.i++;
    }

    const tests: CharTest[] = [];
    let closed = false;
    while (this.peek() !== undefined) {
      if (this.peek() === 0x5d) {
        // ']'
        this.i++;
        closed = true;
        break;
      }
      const lo = this.classAtom();
      // A range only when the '-' is followed by something other than ']'.
      if (this.peek() === 0x2d && this.cps[this.i + 1] !== undefined && this.cps[this.i + 1] !== 0x5d) {
        this.i++; // '-'
        const hi = this.classAtom();
        if (typeof lo !== 'number' || typeof hi !== 'number') {
          throw new PatternError('A character range cannot have a class like \\d on either end', start);
        }
        if (hi < lo) throw new PatternError('A character range runs backwards', start);
        tests.push((c) => c >= lo && c <= hi);
      } else if (typeof lo === 'number') {
        tests.push((c) => c === lo);
      } else {
        tests.push(lo);
      }
    }
    if (!closed) throw new PatternError('Unclosed character class', start);
    if (tests.length === 0) throw new PatternError('Empty character class', start);

    const any: CharTest = (c) => tests.some((t) => t(c));
    return { k: 'char', test: negate ? (c) => !any(c) : any };
  }

  /** One member of a class: a code point, or a class escape's predicate. */
  private classAtom(): number | CharTest {
    const cp = this.peek();
    if (cp === undefined) throw new PatternError('Pattern ends inside a character class', this.i);
    if (cp === 0x5c) {
      const esc = this.escapeValue();
      return esc;
    }
    this.i++;
    return cp;
  }

  private escape(): Ast {
    const value = this.escapeValue();
    if (typeof value === 'number') {
      const cp = value;
      return { k: 'char', test: (c) => c === cp };
    }
    return { k: 'char', test: value };
  }

  /** Returns a literal code point, or a predicate for a class escape. */
  private escapeValue(): number | CharTest {
    const start = this.i;
    this.i++; // '\'
    const cp = this.peek();
    if (cp === undefined) throw new PatternError('Pattern ends with a backslash', start);
    this.i++;

    switch (cp) {
      case 0x64: // d
        return (c) => c >= 0x30 && c <= 0x39;
      case 0x44: // D
        return (c) => !(c >= 0x30 && c <= 0x39);
      case 0x77: // w
        return isWord;
      case 0x57: // W
        return (c) => !isWord(c);
      case 0x73: // s
        return isSpace;
      case 0x53: // S
        return (c) => !isSpace(c);
      case 0x6e:
        return 0x0a; // n
      case 0x72:
        return 0x0d; // r
      case 0x74:
        return 0x09; // t
      case 0x66:
        return 0x0c; // f
      case 0x76:
        return 0x0b; // v
      case 0x30:
        return 0x00; // 0
      case 0x78:
        return this.hex(2, start); // x
      case 0x75:
        return this.unicodeEscape(start); // u
      case 0x62: // b
      case 0x42: // B
        throw new PatternError(
          'Word-boundary assertions (\\b, \\B) are refused: this validator matches the whole value, so a boundary ' +
            'inside it cannot be expressed without backtracking.',
          start,
        );
      default:
        if (cp >= 0x31 && cp <= 0x39) {
          throw new PatternError(
            'Backreferences are refused: a language with backreferences is not regular, and the only engines that ' +
              'match one are backtrackers with the worst case this validator exists to remove.',
            start,
          );
        }
        if (cp === 0x6b) {
          // k
          throw new PatternError('Named backreferences are refused for the same reason as numbered ones.', start);
        }
        if (cp === 0x70 || cp === 0x50) {
          // p / P — Unicode property escapes
          throw new PatternError(
            'Unicode property escapes (\\p{…}) are not supported by this validator. Spell the characters out as a class.',
            start,
          );
        }
        // Everything else escapes to itself: \. \\ \+ \* \? \( \) \[ \] \{ \}
        // \| \^ \$ \/ \- and any punctuation an operator felt like escaping.
        return cp;
    }
  }

  private hex(digits: number, start: number): number {
    let n = 0;
    for (let d = 0; d < digits; d++) {
      const cp = this.peek();
      const v = hexValue(cp);
      if (v === null) throw new PatternError('Malformed hex escape', start);
      n = n * 16 + v;
      this.i++;
    }
    return n;
  }

  private unicodeEscape(start: number): number {
    if (this.peek() === 0x7b) {
      // '{' — \u{1F600}
      this.i++;
      let n = 0;
      let any = false;
      for (;;) {
        const v = hexValue(this.peek());
        if (v === null) break;
        n = n * 16 + v;
        any = true;
        this.i++;
        if (n > 0x10ffff) throw new PatternError('Unicode escape is out of range', start);
      }
      if (!any || this.peek() !== 0x7d) throw new PatternError('Malformed \\u{…} escape', start);
      this.i++; // '}'
      return n;
    }
    return this.hex(4, start);
  }
}

function hexValue(cp: number | undefined): number | null {
  if (cp === undefined) return null;
  if (cp >= 0x30 && cp <= 0x39) return cp - 0x30;
  if (cp >= 0x61 && cp <= 0x66) return cp - 0x61 + 10;
  if (cp >= 0x41 && cp <= 0x46) return cp - 0x41 + 10;
  return null;
}

function isWord(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f;
}

function isSpace(c: number): boolean {
  return (
    c === 0x20 ||
    c === 0x09 ||
    c === 0x0a ||
    c === 0x0b ||
    c === 0x0c ||
    c === 0x0d ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

// ── The NFA ──────────────────────────────────────────────────────────────────

const CHAR = 0;
const SPLIT = 1;
const MATCH = 2;

interface Program {
  /** Parallel arrays, because this is walked once per input character. */
  readonly op: Int8Array;
  readonly next: Int32Array;
  readonly alt: Int32Array;
  readonly tests: Array<CharTest | null>;
  readonly start: number;
}

class Builder {
  readonly op: number[] = [];
  readonly next: number[] = [];
  readonly alt: number[] = [];
  readonly tests: Array<CharTest | null> = [];

  add(op: number, test: CharTest | null): number {
    if (this.op.length >= MAX_NFA_STATES) {
      throw new PatternError(
        `Pattern compiles to more than ${MAX_NFA_STATES} states. Match time is bounded by that number times the ` +
          `value length, so the bound is only a bound if this is refused.`,
      );
    }
    this.op.push(op);
    this.next.push(-1);
    this.alt.push(-1);
    this.tests.push(test);
    return this.op.length - 1;
  }
}

/**
 * Thompson construction. A fragment is a start state plus the dangling exits
 * that the next fragment gets patched into.
 */
interface Frag {
  start: number;
  outs: Array<{ state: number; slot: 'next' | 'alt' }>;
}

function build(b: Builder, ast: Ast): Frag {
  switch (ast.k) {
    case 'empty': {
      // A split whose two arms are the same exit: consumes nothing, and keeps
      // every fragment shaped the same so `cat` needs no special case.
      const s = b.add(SPLIT, null);
      return {
        start: s,
        outs: [
          { state: s, slot: 'next' },
          { state: s, slot: 'alt' },
        ],
      };
    }
    case 'char': {
      const s = b.add(CHAR, ast.test);
      return { start: s, outs: [{ state: s, slot: 'next' }] };
    }
    case 'cat': {
      let first: Frag | null = null;
      let prev: Frag | null = null;
      for (const x of ast.xs) {
        const f = build(b, x);
        if (!prev) {
          first = f;
        } else {
          patch(b, prev.outs, f.start);
        }
        prev = f;
      }
      return { start: first!.start, outs: prev!.outs };
    }
    case 'alt': {
      // Right-nested splits, so an n-way alternation is n-1 states.
      const frags = ast.xs.map((x) => build(b, x));
      let acc = frags[frags.length - 1]!;
      for (let i = frags.length - 2; i >= 0; i--) {
        const s = b.add(SPLIT, null);
        b.next[s] = frags[i]!.start;
        b.alt[s] = acc.start;
        acc = { start: s, outs: [...frags[i]!.outs, ...acc.outs] };
      }
      return acc;
    }
    case 'rep': {
      const { min, max } = ast;
      if (max === null) {
        // x{min,} — min copies, then a star.
        const parts: Frag[] = [];
        for (let i = 0; i < min; i++) parts.push(build(b, ast.x));
        const star = buildStar(b, ast.x);
        parts.push(star);
        return chain(b, parts);
      }
      // x{min,max} — min copies, then (max-min) optional ones, each of which
      // may also skip everything after it.
      const parts: Frag[] = [];
      for (let i = 0; i < min; i++) parts.push(build(b, ast.x));
      const optional: Frag[] = [];
      for (let i = 0; i < max - min; i++) optional.push(buildOptional(b, ast.x));
      return chain(b, [...parts, ...optional]);
    }
  }
}

function buildStar(b: Builder, x: Ast): Frag {
  const s = b.add(SPLIT, null);
  const inner = build(b, x);
  b.next[s] = inner.start;
  patch(b, inner.outs, s);
  return { start: s, outs: [{ state: s, slot: 'alt' }] };
}

function buildOptional(b: Builder, x: Ast): Frag {
  const s = b.add(SPLIT, null);
  const inner = build(b, x);
  b.next[s] = inner.start;
  return { start: s, outs: [...inner.outs, { state: s, slot: 'alt' }] };
}

function chain(b: Builder, parts: Frag[]): Frag {
  if (parts.length === 0) return build(b, { k: 'empty' });
  let prev = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    patch(b, prev.outs, parts[i]!.start);
    prev = parts[i]!;
  }
  return { start: parts[0]!.start, outs: prev.outs };
}

function patch(b: Builder, outs: Frag['outs'], target: number): void {
  for (const o of outs) {
    if (o.slot === 'next') b.next[o.state] = target;
    else b.alt[o.state] = target;
  }
}

/**
 * COMPILE A PATTERN, OR REFUSE IT.
 *
 * The only entry point. Registration and validation both call it, on the same
 * string, so there is no second form of the pattern that could differ from the
 * one that was checked.
 */
export function compilePattern(source: string): CompiledPattern {
  const ast = new Parser(source).parse();
  const b = new Builder();
  const frag = build(b, ast);
  const accept = b.add(MATCH, null);
  patch(b, frag.outs, accept);

  const program: Program = {
    op: Int8Array.from(b.op),
    next: Int32Array.from(b.next),
    alt: Int32Array.from(b.alt),
    tests: b.tests,
    start: frag.start,
  };

  return {
    source,
    states: b.op.length,
    test: (value: string) => run(program, value),
  };
}

/**
 * THE SIMULATION — the whole reason this file exists.
 *
 * One pass over the input. At each character the set of reachable states is
 * advanced as a set, so an alternative that "fails later" costs nothing to have
 * tried: there is no later to go back from. `mark` dedupes states within a
 * step, which is what turns the exponential number of PATHS into a linear
 * number of STATE VISITS.
 */
function run(program: Program, value: string): boolean {
  const n = program.op.length;
  const mark = new Int32Array(n).fill(-1);
  let generation = 0;

  let current: number[] = [];
  let nextList: number[] = [];

  const addState = (list: number[], state: number, gen: number): void => {
    // Iterative, not recursive: an ε-chain can be as long as the program, and a
    // stack overflow inside a validator is just a slower way to fall over.
    const stack = [state];
    while (stack.length > 0) {
      const s = stack.pop()!;
      if (s < 0 || mark[s] === gen) continue;
      mark[s] = gen;
      if (program.op[s] === SPLIT) {
        stack.push(program.alt[s]!);
        stack.push(program.next[s]!);
      } else {
        list.push(s);
      }
    }
  };

  addState(current, program.start, generation);

  for (const ch of value) {
    if (current.length === 0) return false;
    const cp = ch.codePointAt(0)!;
    generation++;
    nextList = [];
    for (const s of current) {
      if (program.op[s] !== CHAR) continue;
      const test = program.tests[s]!;
      if (test(cp)) addState(nextList, program.next[s]!, generation);
    }
    current = nextList;
  }

  return current.some((s) => program.op[s] === MATCH);
}
