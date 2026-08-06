/**
 * A REGEX ENGINE THAT CANNOT BACKTRACK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * `instruments.ts` runs an OPERATOR-SUPPLIED regular expression against a value
 * that came from the internet. With JavaScript's built-in engine that is a
 * denial of service with a six-character payload. Measured, on Node 22:
 *
 *     pattern `(a+)+b`   — 6 characters, well under MAX_PATTERN_LENGTH (200)
 *     input   `aaa…a`    — 29 characters, well under MAX_VALUE_LENGTH (512)
 *     result  — the event loop is blocked, and the cost doubles per character:
 *
 *         len 29    1,567 ms
 *         len 30    3,107 ms   ×1.98
 *         len 31    6,150 ms   ×1.98
 *         len 32   12,367 ms   ×2.01
 *         len 33   24,674 ms   ×2.00
 *
 * The caps were never a mitigation. `MAX_VALUE_LENGTH` permits 512 characters;
 * at the measured doubling that is on the order of 10^140 years for one call.
 * A cap that bounds length bounds nothing at all about runtime when the runtime
 * is exponential in the length.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS AND NOT ONE OF THE OTHER THREE ANSWERS
 *
 * **RE2 (the `re2` npm binding).** The strongest control on the shelf, and
 * rejected here on dependency grounds rather than technical ones. It is a native
 * addon — node-gyp or prebuilt binaries, per platform, per Node ABI — added to
 * the service that holds sellers' bank details. This repo already argued that
 * case about a vendored jar and reached the same answer: a money service does
 * not take a binary dependency it cannot read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNER LOCK (Nitro 2026-08-05) — KEEP THIS FILE FOR OPERATOR PATTERNS
 *
 * The native-`re2` dependency objection above is only half the story.
 * `@intafaced/safe-regex` (FH-SEC-01) wraps **re2js** — pure JS, no node-gyp —
 * and is already used by engineer-owned parsers (`packages/events`,
 * `packages/exchange-contract`). That package is available here too.
 *
 * It was deliberately NOT swapped into `compilePattern` because the engines
 * accept different languages.
 *
 * ── THE MEASUREMENT, RE-RUN 2026-08-06 ──────────────────────────────────────
 *
 * The table that used to sit here was wrong in three cells, so it is restated
 * with the corpus named. That matters because this table IS the evidence the
 * owner lock rests on, and two of the three errors flattered this file.
 *
 * Corpus: 55,000 fuzzed patterns from a piece × quantifier grammar (seed 987654)
 * that — unlike the corpus behind the old table — includes stray and doubled
 * quantifier braces (`{`, `}`, `{}`, `{,3}`, `{2}{3}`) and the whole
 * negated-shorthand-in-class family (`[\s\S]`, `[\d\D]`, `[\S]`, `[^\S]`, …).
 * 19,795 patterns were accepted by both this engine and `RegExp`, giving 118,770
 * match checks. Each row is scored against `RegExp(…, 'u')` over its OWN
 * accepted set:
 *
 *     engine             divergences   accepts what JS rejects   refuses what JS accepts
 *     this file               0                  0                        0
 *     re2js (FH-SEC-01)     523             20,843                    3,153
 *
 * WHAT THE OLD TABLE GOT WRONG
 *
 *   · "this file … refuses 1 — [\D]". It refused the whole family, `[\s\S]`
 *     included — the standard JS spelling of "any character". Fail-closed, so
 *     never dangerous, but `[\D]` was one member reported as the whole set.
 *     Now supported (the complement is folded into the class), hence 0.
 *
 *   · "this file … accepts 0 that JS rejects". False, and this one was NOT
 *     fail-closed: 6,595 of ~55,000 fuzzed patterns were accepted that
 *     `RegExp(…,'u')` rejects, every one a stray or doubled brace being matched
 *     as a literal. See the brace section below. Now 0.
 *
 *   · "re2js … 0 divergences". Also false. re2js is RE2, whose `\s` is ASCII
 *     (`[\t\n\f\r ]`) and whose `.` excludes only `\n`. JS `\s` includes `\v`,
 *     NBSP, U+2028/2029, U+3000 and the BOM, and JS `.` also excludes `\r` and
 *     U+2028/2029. So `\S`, `[\S]`, `[^\S]`, `[a\S]`, `\s` and `.` all mean
 *     something different there — a SILENT change of meaning on an operator's
 *     pattern, which is worse than a refusal because nothing announces it.
 *     re2js's refusals stay the known shapes and are now three, not two:
 *     `\uXXXX`, `[^]` and `[]`. Its 20,843 over-acceptances are quantified bare
 *     assertions (`^*`, `$+`, `^{2}`) and — pointedly — the same stray braces
 *     this commit just closed here.
 *
 * re2js still gains `\b` and `\p{…}`, which this file refuses by name. The
 * locked split below is unchanged by the re-measurement; if anything the
 * whitespace result strengthens it, because operator patterns are exactly where
 * a silent meaning change costs a user a payment method.
 *
 * **Locked split** (also `docs/INTERNET-LEVERAGE-LAW.md` §3.2):
 *   · Operator-supplied field patterns (this service) → **this file**
 *   · Engineer-owned parsers → `@intafaced/safe-regex`
 *   · Native node-gyp / `node-re2` → still banned on money-adjacent services
 *
 * Agents must not silently re2js-swap this path. Revisit only on an explicit
 * owner call. Differential suite in `linear-pattern.test.ts` still pins meaning
 * against `RegExp` if that call is ever made.
 *
 * **A static "is this pattern safe" check at registration.** Pure JS, and it is
 * the answer that ages worst. Detecting catastrophic backtracking exactly is not
 * something a heuristic does: the usual rules (nested quantifier, quantified
 * alternation with overlapping branches) miss polynomial blowup like `\s*\s*$`,
 * miss blowup that only appears once a `{n,m}` is expanded, and reject a great
 * many patterns that are perfectly fine. It would have caught `(a+)+b` and still
 * let something else through, and an operator would have no way to tell which
 * side of the line their pattern fell on.
 *
 * **A hard timeout around the match.** This one was measured rather than
 * assumed, because the usual claim — "a regex in the main loop cannot be
 * interrupted" — turns out to be FALSE on Node 22:
 *
 *     vm.runInNewContext('re.test(s)', …, { timeout: 50 })
 *       → threw "Script execution timed out after 50ms" at 60 ms wall.
 *
 * V8's watchdog does interrupt a running regexp. But the probe that matters is
 * the next one: with a 10 ms interval timer running alongside, the same call
 * produced **0 timer ticks in 59 ms of wall clock**. The timeout bounds the
 * damage per call; it does not stop the block. Every request still gets to
 * freeze the event loop for the whole budget, so N concurrent requests still buy
 * N × budget of dead service — a rate-limiting problem, not a fix. Moving the
 * match into a worker does take it off the loop (`terminate()` returned in 1 ms)
 * at the price of a worker pool and an async boundary in the middle of pure
 * validation. Both are mitigations of a hazard this file removes outright.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 *
 * Thompson's construction plus a Pike-style simulation: the pattern becomes an
 * NFA, and the NFA is simulated over the input tracking the SET of states that
 * are live, rather than exploring one path at a time and reversing out of dead
 * ends. There is no backtracking to be catastrophic. Cost is bounded by
 *
 *     O(states × input length)
 *
 * with no dependence on the shape of the pattern — and both factors are capped
 * (`MAX_NFA_STATES` here, `MAX_VALUE_LENGTH` in `instruments.ts`), so for the
 * first time the caps are a real bound on work rather than a bound on length.
 *
 * It is a whole-string matcher by construction. That is the second bug it
 * closes: the old code textually stripped a leading `^` and a trailing `$` and
 * re-wrapped the remainder, which turned an escaped `\$` into an unterminated
 * group — a pattern that passed registration and threw a raw `SyntaxError` at
 * every user's first save. Nothing here does string surgery on a pattern. `^`
 * and `$` are parsed as the assertions they are, and are simply redundant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DELIBERATELY DOES NOT SUPPORT
 *
 * Backreferences (`\1`), lookahead and lookbehind (`(?=` `(?!` `(?<=` `(?<!`),
 * word boundaries (`\b`, `\B`), and Unicode property escapes (`\p{…}`).
 *
 * The first two are not regular languages and cannot be simulated this way at
 * all — a backreference is the construct that makes matching NP-hard, and it is
 * a first-class ReDoS source in its own right. The last two are omissions of
 * effort rather than of theory. All four are REFUSED AT REGISTRATION, with a
 * message naming the construct, so an operator learns immediately and in front
 * of their own screen. They are not silently ignored, and they are not quietly
 * matched as literal characters — either of which would turn a validation the
 * operator believes in into one that does not hold.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A STRAY QUANTIFIER BRACE IS A SYNTAX ERROR, NOT A LITERAL
 *
 * The paragraph above states the rule; for two years the brace path broke it.
 * `tryBraceQuantifier` rewinds and returns null when a `{` is not a quantifier,
 * and that rewind used to fall through to the literal-character path. So:
 *
 *     [0-9]{3}{2}   accepted — and requires the literal text `123{2}`
 *     a{2}{3}       accepted — and matches nothing at all
 *     {2}           accepted — and matches the three characters `{2}`
 *     a}  a{  a{}  a{,3}  }a      all accepted, all literal
 *
 * Under `RegExp(…, 'u')` every one of these is a SyntaxError. 6,595 of ~55,000
 * fuzzed patterns landed in this class, which made the accepted language a
 * SUPERSET of JS — the exact opposite of the property the header claims and the
 * differential suite exists to hold. The corpus in `linear-pattern.test.ts`
 * missed it for one reason: no entry contained a stray brace. It does now.
 *
 * The cost was not theoretical. An operator writing `[0-9]{3}{2}` for a
 * six-digit field got a field satisfied only by the literal text `123{2}` —
 * nothing a user can type, so the payment method is unusable, and the failure
 * arrives at every user's first save instead of at registration. That is the
 * same shape as the `\$` bug this file was written to close, arriving through a
 * different door. Under the `RegExp` path it had been a registration-time
 * `SyntaxError`; the rewrite silently downgraded it.
 *
 * `\{` and `\}` are still escapes, and `[{}]` inside a class is still two
 * ordinary members, so a literal brace remains spellable — just deliberately,
 * rather than by accident.
 *
 * NOTE for whoever sees a refusal on an ALREADY-REGISTERED pattern: it was
 * already broken. A stored `[0-9]{3}{2}` matched nothing before this change
 * either; it now says why, and says it to the operator rather than to the user.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES SUPPORT THAT IT USED TO REFUSE
 *
 * A negated shorthand inside a character class — `[\S]`, `[\D]`, `[\W]`,
 * `[^\S]`, `[a\S]`, and above all `[\s\S]`, which is how JavaScript spells "any
 * character, newline included". The class member is folded in as the COMPLEMENT
 * of the shorthand's range set (`complementRanges`), which is exact, keeps the
 * class a single instruction, and lets an outer `[^…]` compose correctly.
 */

/** Why a pattern was refused. `unsupported` is a construct, not a typo. */
export type PatternProblem = 'syntax' | 'unsupported' | 'too_large';

export class PatternError extends Error {
  constructor(
    message: string,
    readonly problem: PatternProblem,
  ) {
    super(message);
    this.name = 'PatternError';
  }
}

/**
 * The state budget, and therefore the run-time budget.
 *
 * `{n,m}` is expanded, so a short pattern can ask for a very large automaton —
 * `(a{1000}){1000}` is a million states from sixteen characters, and it nests.
 * That is a compile-time blowup rather than a match-time one, but it is the same
 * denial of service wearing a different hat, so the budget is enforced on every
 * instruction emitted rather than checked once at the end.
 *
 * 2,000 states against the 512-character value cap is ~1M state-visits — low
 * single-digit milliseconds for a pattern deliberately built to be as expensive
 * as the rules allow. Real field patterns are tens of states.
 */
export const MAX_NFA_STATES = 2_000;

/** No value longer than `MAX_VALUE_LENGTH` can match, so nothing above this is meaningful. */
const MAX_REPEAT = 1_000;

// ── the instruction set ──────────────────────────────────────────────────────
//
// Every instruction carries its own successor in `x`. Nothing falls through by
// position, which is what makes the compiler below free to emit fragments in
// any order and patch them afterwards.

const OP_CHAR = 0;
const OP_SPLIT = 1;
const OP_JMP = 2;
const OP_ASSERT_START = 3;
const OP_ASSERT_END = 4;
const OP_MATCH = 5;

/**
 * A set of code points as flattened [lo, hi] pairs, optionally negated.
 * A character class is short, so membership is a linear scan.
 */
interface CharSet {
  readonly negated: boolean;
  readonly ranges: readonly number[];
}

interface Inst {
  readonly op: number;
  readonly set?: CharSet;
  /** Successor, or the first branch of a SPLIT. `-1` until patched. */
  x: number;
  /** Second branch of a SPLIT. */
  y: number;
}

function inSet(set: CharSet, cp: number): boolean {
  const r = set.ranges;
  let hit = false;
  for (let i = 0; i < r.length; i += 2) {
    if (cp >= r[i]! && cp <= r[i + 1]!) {
      hit = true;
      break;
    }
  }
  return set.negated ? !hit : hit;
}

// ── character sets, matching JavaScript's own definitions ────────────────────

const DIGIT: readonly number[] = [0x30, 0x39];
const WORD: readonly number[] = [0x30, 0x39, 0x41, 0x5a, 0x5f, 0x5f, 0x61, 0x7a];
/** JS `\s`: whitespace and line terminators, including the Unicode ones. */
const SPACE: readonly number[] = [
  0x09, 0x0d, 0x20, 0x20, 0xa0, 0xa0, 0x1680, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x202f, 0x205f, 0x205f, 0x3000, 0x3000,
  0xfeff, 0xfeff,
];
/** JS `.` without the `s` flag: anything but a line terminator. */
const DOT_EXCLUDED: readonly number[] = [0x0a, 0x0a, 0x0d, 0x0d, 0x2028, 0x2029];

const SYNTAX_ESCAPABLE = new Set('^$\\.*+?()[]{}|/-'.split('').map((c) => c.codePointAt(0)!));

// ── the syntax tree ──────────────────────────────────────────────────────────
//
// Parsing produces a tree and emits nothing. Expansion of `{n,m}` then happens
// in the compiler, where the state budget can stop it mid-way — which is the
// only place it CAN be stopped, since the tree for `(a{1000}){1000}` is four
// nodes and the automaton is a million states.

type Node =
  | { readonly t: 'empty' }
  | { readonly t: 'char'; readonly set: CharSet }
  | { readonly t: 'assert'; readonly at: 'start' | 'end' }
  | { readonly t: 'concat'; readonly parts: readonly Node[] }
  | { readonly t: 'alt'; readonly options: readonly Node[] }
  | { readonly t: 'repeat'; readonly node: Node; readonly min: number; readonly max: number | null };

class Parser {
  private readonly cp: number[];
  private i = 0;

  constructor(source: string) {
    // CODE POINTS, not UTF-16 units: the engine this replaces ran with the `u`
    // flag, so an astral character was one thing to it. Splitting on units here
    // would silently change what an operator's pattern means.
    this.cp = Array.from(source, (c) => c.codePointAt(0)!);
  }

  parse(): Node {
    const node = this.alternation();
    if (this.i < this.cp.length) throw new PatternError('an unbalanced ")"', 'syntax');
    return node;
  }

  /** alternation := concat ('|' concat)* */
  private alternation(): Node {
    const options: Node[] = [this.concat()];
    while (this.peek() === CP_PIPE) {
      this.i++;
      options.push(this.concat());
    }
    return options.length === 1 ? options[0]! : { t: 'alt', options };
  }

  /** concat := repeat* */
  private concat(): Node {
    const parts: Node[] = [];
    while (this.i < this.cp.length && this.peek() !== CP_PIPE && this.peek() !== CP_RPAREN) {
      parts.push(this.quantified());
    }
    if (parts.length === 0) return { t: 'empty' }; // `(a|)` is legal.
    return parts.length === 1 ? parts[0]! : { t: 'concat', parts };
  }

  /** quantified := atom quantifier? */
  private quantified(): Node {
    const atom = this.atom();
    let node = atom.node;

    /**
     * `^*` / `$+` / `^{2}` — a quantifier on a BARE assertion.
     *
     * JavaScript refuses this under the `u` flag, so this engine refuses it
     * too. The rule being kept is the one at the top of this file: everything
     * accepted here is something JS's own engine would also accept and agree
     * with, which is what makes the differential test in `linear-pattern.test.ts`
     * a meaningful check rather than a comparison of two different languages.
     *
     * Quantifying a GROUP that happens to contain only an assertion — `(?:^)*`
     * — is legal in JS and stays legal here, which is why `fromGroup` is
     * tracked rather than just inspecting the node type.
     */
    const quantifiedAssertion = !atom.fromGroup && node.t === 'assert';

    // A chain like `a*?` is `a*` plus the lazy marker; `a**` is a syntax error
    // in JS and stays one here.
    const c = this.peek();

    if (c === CP_STAR || c === CP_PLUS || c === CP_QUESTION) {
      if (quantifiedAssertion) throw new PatternError('a quantifier applied to "^" or "$"', 'syntax');
      this.i++;
      this.lazySuffix();
      node =
        c === CP_STAR
          ? { t: 'repeat', node, min: 0, max: null }
          : c === CP_PLUS
            ? { t: 'repeat', node, min: 1, max: null }
            : { t: 'repeat', node, min: 0, max: 1 };
    } else if (c === CP_LBRACE) {
      const bounds = this.tryBraceQuantifier();
      if (!bounds) {
        /**
         * `a{`, `a{}`, `a{,3}`, `a{x}` — a `{` in quantifier position that is
         * not a quantifier.
         *
         * `tryBraceQuantifier` rewinds and returns null here, and this used to
         * fall straight through, which left the `{` to be re-read as an atom and
         * matched as a LITERAL BRACE. That is Annex B behaviour — what a browser
         * does for `/a{,3}/` without the `u` flag — and this engine's whole
         * contract is that it accepts a SUBSET of what `RegExp(…, 'u')` accepts.
         * Under `u`, every one of these is a SyntaxError, so they are refused.
         */
        throw new PatternError('a "{" that is not a valid quantifier — write "\\{" for a literal brace', 'syntax');
      }
      if (quantifiedAssertion) throw new PatternError('a quantifier applied to "^" or "$"', 'syntax');
      this.lazySuffix();
      node = { t: 'repeat', node, min: bounds.min, max: bounds.max };
    }

    /**
     * `a**`, `a*+`, and — the case that cost an operator a working field —
     * `[0-9]{3}{2}`.
     *
     * A `{` can only reach this line after a quantifier was already applied
     * (every other route into a `{` is handled above or in `atom`), so it is
     * always the second quantifier in a chain. JS refuses all of these under
     * `u`; before this line the trailing `{2}` was silently matched as three
     * literal characters, which turned "six digits" into "the text `123{2}`" —
     * a field nothing can satisfy, failing at every user's first save rather
     * than at registration in front of the operator who wrote it.
     */
    if (this.peek() === CP_STAR || this.peek() === CP_PLUS || this.peek() === CP_LBRACE) {
      throw new PatternError('a quantifier applied to a quantifier', 'syntax');
    }
    return node;
  }

  /**
   * `*?` / `+?` / `{n,m}?` — laziness is accepted and then ignored.
   *
   * Greedy and lazy differ only in which match is PREFERRED, and this engine
   * answers one question: does the whole value match at all. Two quantifiers
   * that agree on that answer are the same quantifier here. Refusing `+?`
   * instead would reject a pattern that means exactly what its author thinks.
   */
  private lazySuffix(): void {
    if (this.peek() === CP_QUESTION) this.i++;
  }

  /**
   * atom := group | class | '.' | '^' | '$' | escape | literal
   *
   * `fromGroup` records whether the atom was parenthesised, which is the only
   * thing that distinguishes the illegal `^*` from the legal `(?:^)*`.
   */
  private atom(): { node: Node; fromGroup: boolean } {
    const c = this.next();
    if (c === undefined) throw new PatternError('ends unexpectedly', 'syntax');

    if (c === CP_LPAREN) {
      if (this.peek() === CP_QUESTION) {
        // `(?:` is a plain group. Everything else behind `(?` is a construct
        // this engine cannot simulate — name it, do not guess at it.
        if (this.cp[this.i + 1] === CP_COLON) {
          this.i += 2;
        } else {
          const kind = this.cp[this.i + 1];
          const what =
            kind === CP_EQ || kind === CP_BANG ? 'a lookahead' : kind === CP_LT ? 'a lookbehind or named group' : 'an extended group';
          throw new PatternError(`${what} is not supported — the pattern engine here is linear-time and cannot simulate it`, 'unsupported');
        }
      }
      const inner = this.alternation();
      if (this.next() !== CP_RPAREN) throw new PatternError('an unbalanced "("', 'syntax');
      return { node: inner, fromGroup: true };
    }

    const plain = (node: Node) => ({ node, fromGroup: false });

    if (c === CP_RPAREN) throw new PatternError('an unbalanced ")"', 'syntax');
    if (c === CP_LBRACKET) return plain(this.charClass());
    if (c === CP_RBRACKET) throw new PatternError('a lone "]"', 'syntax');

    /**
     * A quantifier brace in ATOM position — `{2}`, `}a`, `a}`.
     *
     * Reaching here means the `{` or `}` has nothing to quantify, which under
     * the `u` flag is a SyntaxError in JavaScript every time. Both used to fall
     * through to the literal-character line at the bottom of this method and be
     * matched as the brace character itself — the same silent-literal bug as
     * `a{2}{3}` above, wearing a different hat. `\{` and `\}` are still escapes
     * (SYNTAX_ESCAPABLE), and `[{}]` inside a class is still a pair of ordinary
     * members, so the only thing refused is the spelling JS also refuses.
     */
    if (c === CP_LBRACE) throw new PatternError('a "{" with nothing to repeat — write "\\{" for a literal brace', 'syntax');
    if (c === CP_RBRACE) throw new PatternError('a lone "}" — write "\\}" for a literal brace', 'syntax');
    if (c === CP_DOT) return plain({ t: 'char', set: { negated: true, ranges: DOT_EXCLUDED } });
    if (c === CP_CARET) return plain({ t: 'assert', at: 'start' });
    if (c === CP_DOLLAR) return plain({ t: 'assert', at: 'end' });
    if (c === CP_STAR || c === CP_PLUS || c === CP_QUESTION) throw new PatternError('a quantifier with nothing to repeat', 'syntax');
    if (c === CP_BACKSLASH) return plain({ t: 'char', set: this.escape(false) });

    return plain({ t: 'char', set: { negated: false, ranges: [c, c] } });
  }

  /** `[abc]`, `[^a-z0-9]`, `[\d.]`, with escapes inside. */
  private charClass(): Node {
    const negated = this.peek() === CP_CARET;
    if (negated) this.i++;

    const ranges: number[] = [];

    for (;;) {
      const c = this.next();
      if (c === undefined) throw new PatternError('an unterminated "["', 'syntax');
      if (c === CP_RBRACKET) break;

      let lo: number;
      if (c === CP_BACKSLASH) {
        const esc = this.escape(true);
        const isSingle = !esc.negated && esc.ranges.length === 2 && esc.ranges[0] === esc.ranges[1];
        if (!isSingle) {
          /**
           * A shorthand inside a class. It folds into the union, and it cannot
           * be the endpoint of a range.
           *
           * A NEGATED shorthand (`\D`, `\W`, `\S`) used to be refused outright.
           * That refusal was the engine's one measured "refuses what JS accepts"
           * — except the header recorded it as `[\D]` alone, when in fact it took
           * out the whole family, including `[\s\S]`, which is the standard JS
           * spelling of "any character, newline included". Folding in the
           * COMPLEMENT is exact, and it costs nothing at match time: a class is
           * still one instruction.
           *
           * Why complement rather than a per-member negated flag: `CharSet`
           * negates the class as a whole, so `[^\S]` has to mean
           * "not (not-whitespace)" = whitespace. Complementing the member and
           * letting the class-level `^` apply on top gets that right by
           * construction, where a second flag would need the two negations
           * composed by hand.
           */
          ranges.push(...(esc.negated ? complementRanges(esc.ranges) : esc.ranges));
          continue;
        }
        lo = esc.ranges[0]!;
      } else {
        lo = c;
      }

      // `a-z` is a range; a `-` immediately before the `]` is a literal `-`.
      if (this.peek() === CP_DASH && this.cp[this.i + 1] !== undefined && this.cp[this.i + 1] !== CP_RBRACKET) {
        this.i++;
        const h = this.next()!;
        const hi = h === CP_BACKSLASH ? this.singleEscape() : h;
        if (hi < lo) throw new PatternError('a character range that runs backwards', 'syntax');
        ranges.push(lo, hi);
      } else {
        ranges.push(lo, lo);
      }
    }

    // `[]` matches nothing and `[^]` matches anything — as in JavaScript.
    //
    // Coalesced before it is frozen. `inSet` is a linear scan, so a union that
    // repeats itself costs real time per character: `[\S\S\S…]` would otherwise
    // carry eleven ranges per `\S`, and the state budget permits 2,000 states
    // against a 512-character value. Merging is what keeps a class the handful of
    // ranges it was before negated shorthands could be folded in.
    return { t: 'char', set: { negated, ranges: normaliseRanges(ranges) } };
  }

  private singleEscape(): number {
    const esc = this.escape(true);
    if (esc.negated || esc.ranges.length !== 2 || esc.ranges[0] !== esc.ranges[1]) {
      throw new PatternError('a shorthand class cannot be the end of a character range', 'syntax');
    }
    return esc.ranges[0]!;
  }

  /** Everything after a backslash. */
  private escape(inClass: boolean): CharSet {
    const c = this.next();
    if (c === undefined) throw new PatternError('ends with a lone "\\"', 'syntax');

    switch (c) {
      case CP_d:
        return { negated: false, ranges: DIGIT };
      case CP_D:
        return { negated: true, ranges: DIGIT };
      case CP_w:
        return { negated: false, ranges: WORD };
      case CP_W:
        return { negated: true, ranges: WORD };
      case CP_s:
        return { negated: false, ranges: SPACE };
      case CP_S:
        return { negated: true, ranges: SPACE };
      case CP_t:
        return lit(0x09);
      case CP_n:
        return lit(0x0a);
      case CP_v:
        return lit(0x0b);
      case CP_f:
        return lit(0x0c);
      case CP_r:
        return lit(0x0d);
      case CP_0:
        return lit(0x00);
      case CP_x:
        return lit(this.hex(2));
      case CP_u:
        return lit(this.unicodeEscape());
      case CP_b:
        if (inClass) return lit(0x08); // `[\b]` is a backspace, per the spec.
        throw new PatternError('a word boundary (\\b) is not supported', 'unsupported');
      case CP_B:
        throw new PatternError('a word boundary (\\B) is not supported', 'unsupported');
      case CP_p:
      case CP_P:
        throw new PatternError('a Unicode property escape (\\p{…}) is not supported', 'unsupported');
      case CP_k:
        throw new PatternError('a named backreference (\\k<…>) is not supported', 'unsupported');
      default:
        if (c >= CP_1 && c <= CP_9) {
          throw new PatternError(
            'a backreference (\\1…\\9) is not supported — it is the construct that makes matching exponential',
            'unsupported',
          );
        }
        // `\-` is a legal escape INSIDE a character class and an illegal one
        // outside it, under the `u` flag. Same rule here.
        if (c === CP_DASH) {
          if (inClass) return lit(c);
          throw new PatternError('"\\-" is only an escape inside "[…]"', 'syntax');
        }
        if (SYNTAX_ESCAPABLE.has(c)) return lit(c);
        throw new PatternError(`"\\${String.fromCodePoint(c)}" is not a recognised escape`, 'syntax');
    }
  }

  private hex(n: number): number {
    let v = 0;
    for (let k = 0; k < n; k++) {
      const c = this.next();
      if (c === undefined) throw new PatternError('a truncated hex escape', 'syntax');
      const d = hexDigit(c);
      if (d < 0) throw new PatternError('a malformed hex escape', 'syntax');
      v = v * 16 + d;
    }
    return v;
  }

  /** `\uXXXX` or `\u{X…}`. */
  private unicodeEscape(): number {
    if (this.peek() !== CP_LBRACE) return this.hex(4);

    this.i++;
    let v = 0;
    let digits = 0;
    while (this.peek() !== CP_RBRACE) {
      const c = this.next();
      if (c === undefined) throw new PatternError('an unterminated \\u{…}', 'syntax');
      const d = hexDigit(c);
      if (d < 0) throw new PatternError('a malformed \\u{…}', 'syntax');
      v = v * 16 + d;
      if (++digits > 6 || v > 0x10ffff) throw new PatternError('a \\u{…} above the Unicode range', 'syntax');
    }
    this.i++;
    if (digits === 0) throw new PatternError('an empty \\u{}', 'syntax');
    return v;
  }

  /** `{n}` `{n,}` `{n,m}` — or `null`, meaning this `{` is a literal brace. */
  private tryBraceQuantifier(): { min: number; max: number | null } | null {
    const save = this.i;
    this.i++; // '{'

    const min = this.digits();
    if (min === null) {
      this.i = save;
      return null;
    }

    let max: number | null = min;
    if (this.peek() === CP_COMMA) {
      this.i++;
      if (this.peek() === CP_RBRACE) {
        max = null;
      } else {
        max = this.digits();
        if (max === null) {
          this.i = save;
          return null;
        }
      }
    }
    if (this.peek() !== CP_RBRACE) {
      this.i = save;
      return null;
    }
    this.i++;

    if (max !== null && max < min) throw new PatternError('a repetition count that runs backwards', 'syntax');
    if (min > MAX_REPEAT || (max !== null && max > MAX_REPEAT)) {
      throw new PatternError(`a repetition count above ${MAX_REPEAT}`, 'too_large');
    }
    return { min, max };
  }

  private digits(): number | null {
    let v: number | null = null;
    for (;;) {
      const c = this.peek();
      if (c === undefined || c < CP_0 || c > CP_9) break;
      v = (v ?? 0) * 10 + (c - CP_0);
      this.i++;
      if (v > MAX_REPEAT) throw new PatternError(`a repetition count above ${MAX_REPEAT}`, 'too_large');
    }
    return v;
  }

  private peek(): number | undefined {
    return this.cp[this.i];
  }

  private next(): number | undefined {
    return this.cp[this.i++];
  }
}

function lit(cp: number): CharSet {
  return { negated: false, ranges: [cp, cp] };
}

/** The whole code-point space. `\S` is its complement minus `\s`, and so on. */
const MAX_CODE_POINT = 0x10ffff;

/** Sorted, coalesced, non-overlapping — the same set, as few ranges as possible. */
function normaliseRanges(ranges: readonly number[]): number[] {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < ranges.length; i += 2) pairs.push([ranges[i]!, ranges[i + 1]!]);
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const out: number[] = [];
  for (const [lo, hi] of pairs) {
    const lastHi = out.length > 0 ? out[out.length - 1]! : null;
    // `lo <= lastHi + 1` also welds [0x30,0x39] to [0x3a,0x41]: adjacent ranges
    // describe one interval, and leaving them apart costs a comparison forever.
    if (lastHi !== null && lo <= lastHi + 1) {
      if (hi > lastHi) out[out.length - 1] = hi;
    } else {
      out.push(lo, hi);
    }
  }
  return out;
}

/**
 * Everything the given set does NOT contain, over the whole code-point space.
 *
 * Used for a negated shorthand inside a character class: `[\S]` is
 * `[` + complement(`\s`) + `]`, which is exactly what JavaScript means by it.
 */
function complementRanges(ranges: readonly number[]): number[] {
  const merged = normaliseRanges(ranges);
  const out: number[] = [];
  let next = 0;

  for (let i = 0; i < merged.length; i += 2) {
    const lo = merged[i]!;
    const hi = merged[i + 1]!;
    if (lo > next) out.push(next, lo - 1);
    next = Math.max(next, hi + 1);
  }
  if (next <= MAX_CODE_POINT) out.push(next, MAX_CODE_POINT);
  return out;
}

function hexDigit(c: number): number {
  if (c >= CP_0 && c <= CP_9) return c - CP_0;
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
  return -1;
}

const CP_PIPE = 0x7c;
const CP_LPAREN = 0x28;
const CP_RPAREN = 0x29;
const CP_LBRACKET = 0x5b;
const CP_RBRACKET = 0x5d;
const CP_LBRACE = 0x7b;
const CP_RBRACE = 0x7d;
const CP_STAR = 0x2a;
const CP_PLUS = 0x2b;
const CP_QUESTION = 0x3f;
const CP_DOT = 0x2e;
const CP_CARET = 0x5e;
const CP_DOLLAR = 0x24;
const CP_BACKSLASH = 0x5c;
const CP_DASH = 0x2d;
const CP_COMMA = 0x2c;
const CP_COLON = 0x3a;
const CP_EQ = 0x3d;
const CP_BANG = 0x21;
const CP_LT = 0x3c;
const CP_0 = 0x30;
const CP_1 = 0x31;
const CP_9 = 0x39;
const CP_B = 0x42;
const CP_D = 0x44;
const CP_P = 0x50;
const CP_S = 0x53;
const CP_W = 0x57;
const CP_b = 0x62;
const CP_d = 0x64;
const CP_f = 0x66;
const CP_k = 0x6b;
const CP_n = 0x6e;
const CP_p = 0x70;
const CP_r = 0x72;
const CP_s = 0x73;
const CP_t = 0x74;
const CP_u = 0x75;
const CP_v = 0x76;
const CP_w = 0x77;
const CP_x = 0x78;

// ── the compiler ─────────────────────────────────────────────────────────────

/** A piece of program with its entry point and its unwired exits. */
interface Fragment {
  readonly start: number;
  /** `[instruction, which pointer]` pairs still needing a destination. */
  readonly out: Array<readonly [number, 'x' | 'y']>;
}

class Compiler {
  private readonly prog: Inst[] = [];

  /**
   * Instruction 0 is always a JMP to the real entry point.
   *
   * It costs one state and buys the invariant that `test()` starts at 0
   * regardless of the order fragments happened to be emitted in. The
   * alternative — renumbering the program afterwards to move the entry to the
   * front — is a rewrite of every jump target in a file whose whole purpose is
   * to be correct about jump targets.
   */
  compile(node: Node): Inst[] {
    const entry = this.emit(OP_JMP);
    const frag = this.node(node);
    this.prog[entry]!.x = frag.start;
    this.patch(frag.out, this.emit(OP_MATCH));
    return this.prog;
  }

  private emit(op: number, set?: CharSet): number {
    if (this.prog.length >= MAX_NFA_STATES) {
      throw new PatternError(`needs more than ${MAX_NFA_STATES} automaton states — simplify it, or lower a repetition count`, 'too_large');
    }
    this.prog.push(set === undefined ? { op, x: -1, y: -1 } : { op, set, x: -1, y: -1 });
    return this.prog.length - 1;
  }

  private patch(out: Fragment['out'], target: number): void {
    for (const [at, slot] of out) this.prog[at]![slot] = target;
  }

  private node(n: Node): Fragment {
    switch (n.t) {
      case 'empty': {
        const pc = this.emit(OP_JMP);
        return { start: pc, out: [[pc, 'x']] };
      }
      case 'char': {
        const pc = this.emit(OP_CHAR, n.set);
        return { start: pc, out: [[pc, 'x']] };
      }
      case 'assert': {
        const pc = this.emit(n.at === 'start' ? OP_ASSERT_START : OP_ASSERT_END);
        return { start: pc, out: [[pc, 'x']] };
      }
      case 'concat': {
        let frag = this.node(n.parts[0]!);
        const start = frag.start;
        for (let k = 1; k < n.parts.length; k++) {
          const next = this.node(n.parts[k]!);
          this.patch(frag.out, next.start);
          frag = next;
        }
        return { start, out: frag.out };
      }
      case 'alt':
        return this.alternatives(n.options, 0);
      case 'repeat':
        return this.repeat(n.node, n.min, n.max);
    }
  }

  private alternatives(options: readonly Node[], from: number): Fragment {
    if (from === options.length - 1) return this.node(options[from]!);
    const split = this.emit(OP_SPLIT);
    const a = this.node(options[from]!);
    this.prog[split]!.x = a.start;
    const b = this.alternatives(options, from + 1);
    this.prog[split]!.y = b.start;
    return { start: split, out: [...a.out, ...b.out] };
  }

  /**
   * `{n,m}` BY EXPANSION.
   *
   * `x{3,5}` becomes `xxx(x(x)?)?`. That is why `MAX_NFA_STATES` is checked
   * inside `emit` rather than after compilation: the expansion has to fail while
   * it is being built, not once a million instructions have been allocated.
   */
  private repeat(node: Node, min: number, max: number | null): Fragment {
    // x*
    if (min === 0 && max === null) {
      const split = this.emit(OP_SPLIT);
      const body = this.node(node);
      this.prog[split]!.x = body.start;
      this.patch(body.out, split);
      return { start: split, out: [[split, 'y']] };
    }

    // x+  — the body runs once, then loops.
    if (min === 1 && max === null) {
      const body = this.node(node);
      const split = this.emit(OP_SPLIT);
      this.prog[split]!.x = body.start;
      this.patch(body.out, split);
      return { start: body.start, out: [[split, 'y']] };
    }

    // x{0,m} — a chain of nested optionals, so that "3 of 5" cannot skip one
    // in the middle and take a later one.
    if (min === 0) {
      return this.optionalChain(node, max!);
    }

    // x{n,…} — n mandatory copies, then whatever remains.
    let first: Fragment | null = null;
    let frag: Fragment | null = null;
    for (let k = 0; k < min; k++) {
      const copy = this.node(node);
      if (frag === null) first = copy;
      else this.patch(frag.out, copy.start);
      frag = copy;
    }

    if (max === min) return { start: first!.start, out: frag!.out };

    const tail = max === null ? this.repeat(node, 0, null) : this.optionalChain(node, max - min);
    this.patch(frag!.out, tail.start);
    return { start: first!.start, out: tail.out };
  }

  /** `(x(x(x)?)?)?` — exactly `count` optional copies, in order. */
  private optionalChain(node: Node, count: number): Fragment {
    if (count === 0) {
      const pc = this.emit(OP_JMP);
      return { start: pc, out: [[pc, 'x']] };
    }
    const split = this.emit(OP_SPLIT);
    const body = this.node(node);
    this.prog[split]!.x = body.start;
    const rest = this.optionalChain(node, count - 1);
    this.patch(body.out, rest.start);
    return { start: split, out: [...rest.out, [split, 'y']] };
  }
}

// ── the matcher ──────────────────────────────────────────────────────────────

/**
 * A compiled operator pattern. Whole-string, linear time, no backtracking.
 *
 * Compilation is where every refusal happens, so an unusable pattern is refused
 * once — in front of the operator who wrote it, never at a user's first save.
 */
export class LinearPattern {
  private readonly seen: Int32Array;
  private generation = 0;

  private constructor(
    readonly source: string,
    private readonly prog: readonly Inst[],
  ) {
    this.seen = new Int32Array(prog.length).fill(-1);
  }

  static compile(source: string): LinearPattern {
    return new LinearPattern(source, new Compiler().compile(new Parser(source).parse()));
  }

  /** How many automaton states it took — the run-time budget, made visible. */
  get stateCount(): number {
    return this.prog.length;
  }

  /**
   * Does the WHOLE value match?
   *
   * The simulation keeps the SET of live states and steps them all together,
   * one input character at a time. A state enters a given step at most once
   * (that is what `seen` is for), and that single fact is the whole reason this
   * cannot blow up: the work per character is bounded by the number of states,
   * however the pattern is shaped.
   *
   * Thread PRIORITY — which of several matches a backtracking engine would
   * prefer — is not tracked, because the only question asked here is whether
   * ANY accepting path exists. That is also why greedy and lazy quantifiers
   * compile to the same automaton.
   */
  test(input: string): boolean {
    const cp = Array.from(input, (c) => c.codePointAt(0)!);
    const len = cp.length;

    let clist: number[] = [];
    let nlist: number[] = [];

    this.generation++;
    this.addThread(clist, 0, 0, len);

    for (let pos = 0; ; pos++) {
      if (clist.length === 0) return false;

      if (pos === len) {
        for (const pc of clist) if (this.prog[pc]!.op === OP_MATCH) return true;
        return false;
      }

      const c = cp[pos]!;
      this.generation++;
      nlist.length = 0;

      for (const pc of clist) {
        const inst = this.prog[pc]!;
        if (inst.op === OP_CHAR && inSet(inst.set!, c)) this.addThread(nlist, inst.x, pos + 1, len);
      }

      const swap = clist;
      clist = nlist;
      nlist = swap;
    }
  }

  /**
   * Epsilon closure from `pc`, at input position `pos`.
   *
   * Iterative rather than recursive: a 2,000-state automaton of nested groups
   * would otherwise be a stack overflow, which is the same denial of service
   * this file exists to remove.
   */
  private addThread(list: number[], pc: number, pos: number, len: number): void {
    const stack = [pc];

    while (stack.length > 0) {
      const p = stack.pop()!;
      if (p < 0 || p >= this.prog.length) continue;
      if (this.seen[p] === this.generation) continue;
      this.seen[p] = this.generation;

      const inst = this.prog[p]!;
      switch (inst.op) {
        case OP_SPLIT:
          stack.push(inst.y, inst.x);
          break;
        case OP_JMP:
          stack.push(inst.x);
          break;
        case OP_ASSERT_START:
          if (pos === 0) stack.push(inst.x);
          break;
        case OP_ASSERT_END:
          if (pos === len) stack.push(inst.x);
          break;
        default:
          list.push(p); // OP_CHAR consumes input; OP_MATCH accepts.
      }
    }
  }
}
