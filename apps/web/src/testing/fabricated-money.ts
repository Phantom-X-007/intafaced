/**
 * "IS THERE MONEY IN THIS MARKUP THAT NOBODY FETCHED?"
 *
 * Test-only. Imported by `*.test.tsx`, never by a component.
 *
 * ── Why this is a scan over rendered HTML and not an element query ──────────
 *
 * The bug it exists to prevent was not a wrong number in a known place. It was
 * a number in a place nobody was looking: `apps/web` had 74 tests, all of them
 * under `src/lib`, so the rendered output of every component in the app was
 * unobserved, and five invented prices plus four invented ledger totals sat on
 * the default page for months under a "Streaming" badge.
 *
 * An assertion written as "the price cell should not say 68,412.50" would have
 * caught that exact literal and nothing else — the next fabricated figure goes
 * in a different cell, or a new panel, and passes. So the shape of the check
 * has to match the shape of the rule, and the rule is absolute: no surface
 * renders a money figure it did not get from a service. That is a property of
 * the whole document, so it is checked against the whole document.
 *
 * ── What counts as money-shaped ─────────────────────────────────────────────
 *
 * Three patterns, chosen because between them they cover how every figure on
 * the old landing page was written, and how anyone would write the next one:
 *
 *   · a currency symbol against a digit — `$1,284,930,551.00`
 *   · a thousands-separated group — `68,412.50`, `92,441,006`
 *   · two or more decimal places — `4.1820`, `0.84`
 *
 * Deliberately NOT matched: bare small integers. A rank, a count of modules, a
 * year and a CSS-module hash are all bare integers, and a rule that flagged
 * them would be turned off within a week — which is the failure mode that costs
 * more than the false negatives it prevents. Fabricated *counts* are caught by
 * naming them (`expectNoText`), not by pattern.
 *
 * ── Using it where money is legitimately rendered ───────────────────────────
 *
 * A panel that has really fetched a price must obviously render one, and that
 * markup will match. Those tests assert provenance instead — the exact decimal
 * string from the fixture appears, unmodified — and do not call this. See
 * `market-pulse.test.tsx`: the untraded, failed, loading and empty states are
 * scanned; the traded state is checked for verbatim pass-through.
 */

export interface MoneyShape {
  readonly name: string;
  readonly pattern: RegExp;
}

export const MONEY_SHAPES: readonly MoneyShape[] = [
  { name: 'currency symbol against a digit', pattern: /[$€£¥₿]\s?\d/g },
  { name: 'thousands-separated group', pattern: /\d{1,3}(?:,\d{3})+/g },
  { name: 'two or more decimal places', pattern: /\d+\.\d{2,}/g },
];

export interface MoneyHit {
  readonly shape: string;
  readonly text: string;
}

/** Every money-shaped run in `html`, with the rule each one tripped. */
export function findMoneyShapes(html: string): readonly MoneyHit[] {
  const hits: MoneyHit[] = [];
  for (const { name, pattern } of MONEY_SHAPES) {
    // `pattern` is module-level and global; `matchAll` needs the /g flag and
    // does not mutate lastIndex, so repeated calls are safe.
    for (const match of html.matchAll(pattern)) {
      hits.push({ shape: name, text: match[0] });
    }
  }
  return hits;
}

/**
 * A failure message that names the offending text, not just the count.
 *
 * The engineer who trips this will be looking at a diff of their own component
 * and needs to be told which string in the output was the problem.
 */
export function describeMoneyShapes(hits: readonly MoneyHit[]): string {
  const lines = hits.map((h) => `  · "${h.text}"  (${h.shape})`);
  return [
    `Rendered markup contains ${hits.length} money-shaped literal(s) that no service supplied:`,
    ...lines,
    '',
    'Money on a rendered surface must come from a service response, and a surface',
    'with no service behind it must render the absence — not a plausible figure.',
    'See apps/web/src/app/page.tsx for what this rule cost the last time it was broken.',
  ].join('\n');
}

/**
 * ── THE SECOND CLASS: INVENTED INCREMENTS ───────────────────────────────────
 *
 * Everything above scans RENDERED MARKUP, and that is the right shape for a
 * fabricated *price*, because a fabricated price is a figure a user reads.
 *
 * It cannot see the bug this half exists for. `terminal.tsx` shipped:
 *
 *     tickSize={selected?.tickSize ?? '0.01'}
 *     lotSize={selected?.lotSize ?? '0.00000001'}
 *
 * Neither literal is ever rendered. They are fed to `decimalsOf`, which turns
 * `'0.01'` into the number 2, and that 2 decides how many digits get truncated
 * off every price on the depth ladder. The output is a *correctly formatted*
 * price at a precision nobody published — so it passes a markup scan, it passes
 * review, and it looks right on screen. That is what makes it worse than a fake
 * price rather than better: a fake price is obvious to anyone who knows the
 * market, and a wrong tick is invisible until an order fills at the wrong size.
 *
 * So this half scans SOURCE. The rule it enforces is narrow and absolute: a
 * money-increment identifier may not be given a literal default. Not a decimal
 * string, not a decimal-place count. If the instrument did not say, the surface
 * refuses — see `LiveOrderBook` and `OrderTicket`, which both do.
 */

/** Identifiers whose value is an increment, a precision, or a floor. */
const INCREMENT_FIELDS = String.raw`tick[Ss]ize|lot[Ss]ize|step[Ss]ize|min[QN]|minQty|minNotional|maxQty|precision|decimals|priceDp|sizeDp|pip[Ss]ize|contractSize`;

export interface IncrementHit {
  readonly rule: string;
  readonly text: string;
  readonly line: number;
}

const INCREMENT_RULES: readonly MoneyShape[] = [
  {
    // `tickSize ?? '0.01'` · `lotSize || "1e-8"` — a decimal-string default.
    name: 'increment defaulted to a literal decimal string',
    pattern: new RegExp(String.raw`(?:${INCREMENT_FIELDS})[^\n]{0,40}?(?:\?\?|\|\|)\s*['"\`]\s*[\d.]`, 'g'),
  },
  {
    // `market ? decimalsOf(m.tickSize) : 2` — a decimal-PLACE-count default.
    name: 'precision defaulted to a literal digit count',
    pattern: new RegExp(String.raw`(?:${INCREMENT_FIELDS})[^\n]{0,60}?(?::|\?\?|\|\|)\s*\d+\s*[;,)\n]`, 'g'),
  },
  {
    // `const TICK = '0.01'` — a module-level increment nobody fetched.
    name: 'increment bound to a hardcoded decimal constant',
    pattern: new RegExp(String.raw`(?:const|let|var)\s+\w*(?:${INCREMENT_FIELDS})\w*\s*(?::[^=\n]+)?=\s*['"\`]\s*[\d.]`, 'gi'),
  },
];

/**
 * Every invented-increment shape in `source`, with the line it sits on.
 *
 * Pass real component source (read it with `node:fs`), not markup. A `null`
 * default is deliberately NOT a hit — `?? null` is how a surface says "the
 * instrument did not tell me", which is the outcome this rule wants.
 */
export function findInventedIncrements(source: string): readonly IncrementHit[] {
  const hits: IncrementHit[] = [];
  for (const { name, pattern } of INCREMENT_RULES) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      hits.push({ rule: name, text: match[0].trim().replace(/\s+/g, ' '), line });
    }
  }
  return hits;
}

export function describeInventedIncrements(hits: readonly IncrementHit[]): string {
  const lines = hits.map((h) => `  · line ${h.line}: "${h.text}"  (${h.rule})`);
  return [
    `Source contains ${hits.length} invented increment(s):`,
    ...lines,
    '',
    'A tick size, lot size or precision is a property of the INSTRUMENT. A default',
    'here mis-rounds a real order — the user asks for one size and the venue gets',
    'another — and unlike a fabricated price it renders as something plausible.',
    'If the instrument did not publish it, refuse and say so. Never substitute.',
  ].join('\n');
}
