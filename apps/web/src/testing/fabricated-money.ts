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
