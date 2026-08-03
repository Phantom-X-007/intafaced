#!/usr/bin/env node
/**
 * "IS THERE MONEY IN THIS SURFACE THAT NOBODY FETCHED?"
 *
 * This is `apps/web/src/testing/fabricated-money.ts` promoted out of a doomed
 * app and into the gate list.
 *
 * ── WHY IT MOVED, AND WHY IT COULD NOT WAIT ─────────────────────────────────
 *
 * That module was the only automated check in the repo that read output and
 * failed on a money-shaped literal no service supplied. Its own header records
 * what it was written for: `apps/web` had 74 tests, all of them under `src/lib`,
 * so the rendered output of every component was unobserved, and five invented
 * prices plus four invented ledger totals sat on the default page for months
 * under a "Streaming" badge.
 *
 * It had exactly two consumers — `app/page.test.tsx` and
 * `components/landing/market-pulse.test.tsx` — and `apps/web` is being deleted
 * in the same change that promotes the vendored Vue shell to sole product
 * surface. The shell's entire automated unit suite is one file
 * (`test/unit/specs/HelloWorld.spec.js`), and no root script invokes it. So the
 * window between "delete the old app" and "guard the new one" would have been
 * precisely the condition that produced the original bug: a product surface
 * nothing looks at.
 *
 * It lives in `tooling/ci/` rather than in the shell's own `test/unit/` for the
 * same reason: `pnpm verify` runs this directory. It does not run that one.
 *
 * ── WHAT THIS PORT COSTS, STATED PLAINLY ────────────────────────────────────
 *
 * The original scanned RENDERED HTML. Rendering a Vue 2 SFC needs a runner, and
 * there is none wired in, so this scans TEMPLATE SOURCE instead.
 *
 * That is weaker, in one specific and knowable way: a literal assembled at
 * runtime evades it. `'68,4' + '12.50'` is invisible here. So is a figure that
 * arrives from a computed property, a filter, a mixin, or a string built in a
 * `.js` helper and injected with `v-html`. A source scan sees what an author
 * typed; a render scan sees what a user reads, and those are not the same set.
 *
 * What it buys in exchange is that it runs on every `pnpm verify` with no
 * browser, no jsdom and no test harness — which is the difference between a
 * guard that exists and a guard that is planned. When the shell gains a real
 * component runner, the honest upgrade is to render each page and run
 * MONEY_SHAPES over the output, keeping this scan as the cheap first pass.
 *
 * ── WHAT COUNTS AS MONEY-SHAPED (unchanged from the original) ───────────────
 *
 * Three patterns, chosen because between them they cover how every figure on
 * the old landing page was written, and how anyone would write the next one:
 *
 *   · a currency symbol against a digit — `$1,284,930,551.00`
 *   · a thousands-separated group — `68,412.50`, `92,441,006`
 *   · two or more decimal places — `4.1820`, `0.84`
 *
 * Deliberately NOT matched: bare small integers. A rank, a count of modules, a
 * year and a CSS-module hash are all bare integers, and a rule that flagged them
 * would be turned off within a week — which is the failure mode that costs more
 * than the false negatives it prevents. That restraint is load-bearing and is
 * carried over verbatim. Fabricated *counts* are caught by naming them, not by
 * pattern.
 *
 * ── PROVENANCE, WHICH IS THE ONLY DEFENCE ───────────────────────────────────
 *
 * In the original, a panel that had really fetched a price obviously rendered
 * one, and that markup matched. Those tests proved PROVENANCE instead: the exact
 * decimal string from the fixture appears in the output, unmodified.
 *
 * A template literal has no provenance available to it. A number typed into
 * markup is by construction a number no service supplied — there is no fixture
 * behind it and no response it can be traced to. So the rule here is absolute:
 * in a `<template>`, a money-shaped literal is a violation, full stop. The fix
 * is to fetch it and render the response, or to render the absence. It is never
 * to add a row to BASELINE — that map is a record of debt that predates the
 * gate, not a place to put new debt.
 *
 * ── THE SECOND CLASS: INVENTED INCREMENTS ───────────────────────────────────
 *
 * Ported from `fix/terminal-no-invented-increments`, which added
 * `findInventedIncrements` to the same module for a bug the markup half cannot
 * see. `terminal.tsx` shipped:
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
 * So this half scans SOURCE. The rule is narrow and absolute: a money-increment
 * identifier may not be given a literal default. Not a decimal string, not a
 * decimal-place count. If the instrument did not say, the surface refuses.
 *
 * A `null` default is deliberately NOT a hit. `?? null` is how a surface says
 * "the instrument did not tell me", which is the outcome the rule wants.
 *
 * Two changes from the branch version, both because this scan points at the
 * shell rather than at the React terminal:
 *
 *   · INCREMENT_FIELDS gains `coinScale` / `baseCoinScale` / `priceScale` (via
 *     `\w*[Ss]cale`) and `\w*[Ff]ee`. Those are the shell's own names for the
 *     same thing, and its own invented defaults sit on them.
 *   · A fourth rule, `increment defaulted through a ternary`, because the shell
 *     writes `scale == null ? 2 : scale` where the terminal wrote `?? 2`. The
 *     branch's three rules cannot see it, and it is the same bug.
 *
 * ── THE THIRD CLASS: MONEY ARITHMETIC IN MARKUP ─────────────────────────────
 *
 * `{{ fmt(row.price * row.amount, 2) }}` is a figure in a "Value" column that no
 * service ever sent. It is two service-supplied numbers multiplied in the
 * browser, in IEEE-754 floating point, and rendered as money — which breaks the
 * money rule twice over (§0.6: no module holds its own balance; and money is
 * never a `number`). A notional is the venue's to state.
 *
 * The rule requires BOTH operands to be money-named. `(num(symbolFee) * 100)` is
 * a unit conversion of one fetched value and is not a hit; `aprBps / 100` is
 * likewise a conversion, and division is not matched at all — `/` collides with
 * every URL and asset path in the tree, and a rule with that false-positive rate
 * is a rule someone deletes.
 *
 * ── HOW IT REPORTS ──────────────────────────────────────────────────────────
 *
 * The failure names the offending STRING, not just the file. The engineer who
 * trips this is looking at a diff of their own template and needs to be told
 * which run of characters was the problem — that was true of the original and it
 * is the whole reason `describeMoneyShapes` existed.
 *
 * ── WHY THERE IS A BASELINE ─────────────────────────────────────────────────
 *
 * The shell has twelve of these today across three files, and the nine that
 * matter most sit in files other branches are mid-change on. Same shape of
 * problem as `i18n-bypass-scan.mjs`, same answer: enumerate the debt exactly,
 * freeze it, and let the number only go down. This is not a TODO pointing at
 * "later" (§14.8) — every frozen item is written out below with the exact text
 * it matched, it is enforced on every `pnpm verify`, and it cannot grow.
 *
 * The alternative was registering this `advisory: true` so it could fail loudly
 * and block nothing. A gate that is red on every run is a gate whose red means
 * nothing, and `gates.mjs` says so itself: advisory "is NOT a way to silence a
 * gate that fails". A frozen, itemised baseline blocks the thirteenth figure
 * today, which is the whole point — the bug this file exists for was never the
 * figures already on the page.
 *
 * Unlike the i18n baseline, rows here freeze the exact matched TEXT rather than
 * a count. A count lets a fixed violation and a fresh one cancel out silently,
 * and "name the string" is this scan's founding principle — so the baseline
 * names them too. Line numbers are deliberately absent: they drift on every edit
 * above them, and a baseline that goes stale for a reason unrelated to money is
 * a baseline someone deletes.
 *
 * Exit 0 = at or below the frozen baseline. Exit 1 = it grew, or a row is stale.
 *
 *   node tooling/ci/fabricated-money-scan.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set(['node_modules', 'dist', 'static', '.git', 'target', 'build']);

/**
 * The product surface is FOUND, not hardcoded, for two reasons that are both
 * load-bearing:
 *
 *   1. `brand-scan.mjs` forbids naming the upstream tree anywhere in source, and
 *      that ban has no exemption for CI scripts. Writing the path here turns
 *      this gate red on a different gate — which is how the first version of
 *      this file was caught.
 *   2. Half of `brand-scan.mjs`'s allowlist ends "remove this entry once the
 *      vendor directory is renamed". When that rename happens, a hardcoded path
 *      would leave this scan silently walking nothing and passing forever, which
 *      is the exact failure mode described for i18n-bypass below. Discovery
 *      survives the rename.
 *
 * A shell root is any `src/` under `vendor/` that holds a Vue 2 entry pair —
 * `App.vue` beside `main.js`. That is the signature of an SFC application root
 * and not of anything else vendored here (the rest is Java).
 */
function findShellRoots(dir, out = [], depth = 0) {
  if (depth > 4 || !existsSync(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  if (entries.includes('App.vue') && entries.includes('main.js')) {
    out.push(dir);
    return out; // Do not descend into a root we have already claimed.
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    try {
      if (statSync(full).isDirectory()) findShellRoots(full, out, depth + 1);
    } catch {
      /* unreadable — nothing to scan */
    }
  }
  return out;
}

/**
 * Third-party libraries redistributed unmodified. Not our surface, not our
 * increments, and the minified ones are a single 150KB line — scanning them
 * produces hits nobody can act on, which is how a gate earns its reputation for
 * noise. Every entry is a library we did not write.
 *
 * @type {{ path: string, reason: string }[]}
 */
const THIRD_PARTY = [
  { path: 'assets/js/bignumber.min.js', reason: 'bignumber.js, minified — arbitrary-precision library, not a surface' },
  { path: 'assets/js/gt.js', reason: 'captcha vendor client, redistributed unmodified' },
  { path: 'assets/js/jquery.min.js', reason: 'jQuery, minified' },
  { path: 'assets/js/jquery-2.0.3.min.js', reason: 'jQuery 2.0.3, minified' },
  { path: 'assets/js/jquery.base64Upload.js', reason: 'third-party jQuery plugin' },
  { path: 'assets/js/jquery.fullPage.min.js', reason: 'third-party jQuery plugin, minified' },
  { path: 'assets/js/jquery.peity.min.js', reason: 'third-party jQuery plugin, minified' },
  { path: 'assets/js/jquery.qrcode.min.js', reason: 'third-party jQuery plugin, minified' },
  {
    path: 'assets/js/market-chart/lightweight-charts.standalone.production.js',
    reason: "charting library, minified production bundle — its own axis/precision defaults are the library's, not ours",
  },
];

// ── The money shapes, carried over verbatim from the original ───────────────

/** @type {{ name: string, pattern: RegExp }[]} */
export const MONEY_SHAPES = [
  { name: 'currency symbol against a digit', pattern: /[$€£¥₿]\s?\d/g },
  { name: 'thousands-separated group', pattern: /\d{1,3}(?:,\d{3})+/g },
  { name: 'two or more decimal places', pattern: /\d+\.\d{2,}/g },
];

/** Identifiers whose value is an increment, a precision, a floor or a rate. */
const INCREMENT_FIELDS = String.raw`tick[Ss]ize|lot[Ss]ize|step[Ss]ize|min[QN]|minQty|minNotional|maxQty|precision|decimals|priceDp|sizeDp|pip[Ss]ize|contractSize|\w*[Ss]cale|\w*[Ff]ee`;

/** Identifiers whose value is money. Used only to require BOTH sides of a `*`. */
const MONEY_FIELDS = String.raw`price|amount|qty|quantity|volume|turnover|total|balance|fee|notional|cost`;
const MONEY_IDENT = String.raw`(?:[\w$]+\.)?[\w$]*(?:${MONEY_FIELDS})[\w$]*`;

/** @type {{ name: string, pattern: RegExp }[]} */
const INCREMENT_RULES = [
  {
    // `tickSize ?? '0.01'` · `lotSize || "1e-8"` — a decimal-string default.
    name: 'increment defaulted to a literal decimal string',
    pattern: new RegExp(String.raw`(?:${INCREMENT_FIELDS})[^\n]{0,40}?(?:\?\?|\|\|)\s*['"\`]\s*[\d.]`, 'g'),
  },
  {
    // `coinScale: 6` · `options.scale || 2` — a decimal-PLACE-count default.
    name: 'precision defaulted to a literal digit count',
    pattern: new RegExp(String.raw`(?:${INCREMENT_FIELDS})[^\n]{0,60}?(?::|\?\?|\|\|)\s*\d+(?:\.\d+)?\s*[;,)\n]`, 'g'),
  },
  {
    // `const TICK = '0.01'` — a module-level increment nobody fetched.
    name: 'increment bound to a hardcoded decimal constant',
    pattern: new RegExp(String.raw`(?:const|let|var)\s+\w*(?:${INCREMENT_FIELDS})\w*\s*(?::[^=\n]+)?=\s*['"\`]\s*[\d.]`, 'gi'),
  },
  {
    // `scale == null ? 2 : scale` — the same default wearing a ternary.
    name: 'increment defaulted through a ternary',
    pattern: new RegExp(String.raw`(?:${INCREMENT_FIELDS})[^\n]{0,40}?\?\s*\d+(?:\.\d+)?\s*:`, 'g'),
  },
];

/** @type {{ name: string, pattern: RegExp }[]} */
const MARKUP_ARITHMETIC_RULES = [
  {
    name: 'money multiplied by money in a template — a figure no service sent',
    pattern: new RegExp(String.raw`(?:${MONEY_IDENT})\s*\*\s*(?:${MONEY_IDENT})`, 'gi'),
  },
];

/**
 * THE FROZEN QUEUE. Every invented figure the shell holds today, by the exact
 * text it matched. Frozen 2026-08-03 at 3 files / 12 findings.
 *
 * Keys are relative to the shell root, not the repo root — for the same
 * brand-scan reason `findShellRoots` exists, and with the same benefit: the
 * queue survives the vendor directory being renamed. Findings are still
 * REPORTED at their full repo-relative path, because a path you cannot paste
 * into an editor is not a report.
 *
 * Not fixed here on purpose: `pages/exchange/Exchange.vue` is owned by sibling
 * branches at the time of writing, and editing a file two people are mid-change
 * on costs more than the day it would save. The debt is named so the owner can
 * clear it; delete each string as it goes.
 *
 * A file absent from this map may hold no findings at all. A file present may
 * hold no findings its row does not name. Both directions are enforced, and by
 * multiset — three `0.00` placeholders freeze three rows, so a fourth is still a
 * failure. A row that survives its violation is the same dishonesty this whole
 * scan is about.
 *
 * On the `'0.00'` rows specifically, because they look the most arguable: a
 * placeholder is rendered markup, so the original scan over rendered HTML would
 * have caught them too. And they are not merely cosmetic — `0.00` on a price
 * field tells the user this market quotes to two decimals, which is a precision
 * claim about an instrument whose real scale the shell defaults to 6 elsewhere
 * in the same file. It is the invented-increment bug wearing a hint.
 *
 * @type {Record<string, string[]>}
 */
const BASELINE = {
  'assets/js/market-chart/kline.js': ['priceScale = Math.pow(10, options.scale || 2)'],
  'pages/exchange/Exchange.vue': [
    'coinScale: 6,',
    'baseCoinScale: 6,',
    /* RP1 removed: symbolFee float literal + tape float product (ix-money now). */
    'scale = this.baseCoinScale || 2;',
    'scale == null ? 2 :',
    // `:placeholder="orderType === 'MARKET_PRICE' ? 'Best available' : '0.00'"`
    '0.00',
    // `placeholder="0.00"` on the limit-price input
    '0.00',
  ],
  // Three `placeholder="0.00"` hints — price, minAmount, maxAmount.
  'pages/otc/AdPublish.vue': ['0.00', '0.00', '0.00'],
};

// ── Extraction ─────────────────────────────────────────────────────────────

/**
 * A block of an SFC, blanked outside the block so line numbers stay true to the
 * file on disk. Reporting a line number that is right only relative to some
 * extracted fragment is worse than reporting none.
 */
function block(source, tag) {
  const open = new RegExp(String.raw`<${tag}[^>]*>`);
  const start = open.exec(source);
  if (!start) return null;
  const end = source.lastIndexOf(`</${tag}>`);
  if (end < start.index) return null;
  const head = source.slice(0, start.index + start[0].length);
  return head.replace(/[^\n]/g, ' ') + source.slice(start.index + start[0].length, end);
}

/**
 * Two things in a template are not markup a user reads, and both would trip the
 * money shapes while meaning nothing:
 *
 *   · an HTML comment. `Exchange.vue` carries one explaining why the balances
 *     panel refuses to print "a table of every asset at 0.00" — a comment whose
 *     entire subject is not fabricating money, flagged for fabricating money, is
 *     exactly the false positive that gets a scan switched off.
 *   · a `style` or `class` value. A CSS length is not a figure; `width:12.50%`
 *     matches "two or more decimal places" and means nothing.
 *
 * Both are blanked character-for-character so line numbers survive. This is a
 * statement about what the characters mean, not a loosening of the rule — the
 * patterns are unchanged.
 */
function withoutNonMarkup(template) {
  const blank = (m) => m.replace(/[^\s\n]/g, ' ');
  return template.replace(/<!--[\s\S]*?-->/g, blank).replace(/\b(?:style|class)\s*=\s*("[^"]*"|'[^']*')/g, blank);
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.vue') || name.endsWith('.js')) yield full;
  }
}

function isThirdParty(shellRelative) {
  return THIRD_PARTY.some((entry) => shellRelative === entry.path);
}

/**
 * Golden tests are where an explicit precision BELONGS.
 *
 * `ix-money.golden.js` asserts that a value formats correctly at six places by
 * passing `scale: 6` into the function under test. That is the fixture stating
 * the precision the assertion is about — the opposite of production code
 * defaulting one because a service did not publish it.
 *
 * A test file is also not a surface: nothing here is rendered, so no figure in
 * it can reach a user. The rules below exist to catch money on a rendered
 * surface, and flagging the tests that PROVE the money rules would train people
 * to add fixtures to the baseline, which is how a ratchet stops meaning
 * anything.
 *
 * This exempts the fixtures only. The module under test is scanned normally.
 */
function isGoldenTest(shellRelative) {
  return shellRelative.endsWith('.golden.js') || shellRelative.endsWith('.test.js');
}

function scan(text, rules, key, reported, out) {
  for (const { name, pattern } of rules) {
    for (const match of text.matchAll(pattern)) {
      out.push({
        key,
        reported,
        line: text.slice(0, match.index).split('\n').length,
        rule: name,
        text: match[0].trim().replace(/\s+/g, ' '),
      });
    }
  }
}

// ── Run ────────────────────────────────────────────────────────────────────

const shells = findShellRoots(join(ROOT, 'vendor'));

/**
 * A missing shell is a PASS, but never a silent one. If discovery ever stops
 * finding the surface — a rename, a move, a delete — the run says so on the line
 * `gates.mjs` prints, rather than reporting a clean scan of nothing. That is the
 * i18n-bypass failure mode, and it is cheap to refuse it here.
 */
if (shells.length === 0) {
  console.log('✓ fabricated-money — no Vue shell root (App.vue beside main.js) found under vendor/. NOTHING WAS SCANNED.');
  console.log('  If the product surface still exists, discovery is broken — fix findShellRoots, do not ignore this line.');
  process.exit(0);
}

const findings = [];
let scanned = 0;

for (const shell of shells) {
  for (const file of walk(shell)) {
    const key = relative(shell, file).split(sep).join('/');
    if (isThirdParty(key) || isGoldenTest(key)) continue;

    // Reported at the full path (pasteable), keyed at the shell-relative one
    // (rename-proof, and sayable without naming the upstream).
    const reported = relative(ROOT, file).split(sep).join('/');
    const source = readFileSync(file, 'utf8');
    scanned++;

    if (file.endsWith('.vue')) {
      const template = block(source, 'template');
      if (template !== null) {
        scan(withoutNonMarkup(template), MONEY_SHAPES, key, reported, findings);
        scan(template, MARKUP_ARITHMETIC_RULES, key, reported, findings);
      }
      const script = block(source, 'script');
      if (script !== null) scan(script, INCREMENT_RULES, key, reported, findings);
    } else {
      scan(source, INCREMENT_RULES, key, reported, findings);
    }
  }
}

// ── Compare against the frozen queue ───────────────────────────────────────

const byFile = new Map();
for (const hit of findings) {
  if (!byFile.has(hit.key)) byFile.set(hit.key, []);
  byFile.get(hit.key).push(hit);
}

const problems = [];

for (const [key, hits] of byFile) {
  const remaining = [...(BASELINE[key] ?? [])];
  for (const hit of hits) {
    const at = remaining.indexOf(hit.text);
    if (at >= 0) remaining.splice(at, 1);
    else problems.push({ severity: 'new', file: hit.reported, line: hit.line, rule: hit.rule, text: hit.text });
  }
}

for (const [key, frozen] of Object.entries(BASELINE)) {
  const hits = byFile.get(key) ?? [];
  const remaining = hits.map((h) => h.text);
  for (const text of frozen) {
    const at = remaining.indexOf(text);
    if (at >= 0) remaining.splice(at, 1);
    else problems.push({ severity: 'stale', file: hits[0]?.reported ?? key, text });
  }
}

const frozenTotal = Object.values(BASELINE).reduce((n, rows) => n + rows.length, 0);

if (problems.length === 0) {
  console.log(`✓ fabricated-money — ${scanned} shell file(s), ${findings.length} finding(s), all at the frozen baseline`);
  for (const [key, rows] of Object.entries(BASELINE)) {
    const where = byFile.get(key)?.[0]?.reported ?? key;
    console.log(`  ⚠ ${where} — ${rows.length} invented figure(s) still there: ${rows.map((r) => `"${r}"`).join(', ')}`);
  }
  // `gates.mjs` prints only the LAST non-empty line as a gate's summary, so the
  // debt has to be on it. A green tick over an unnamed twelve is how a frozen
  // queue becomes a forgotten one.
  console.log(
    `  ⚠ ${frozenTotal} invented figure(s) frozen across ${Object.keys(BASELINE).length} file(s) — the queue cannot grow. ` +
      'Money on a surface comes from a service response, or the surface renders the absence.',
  );
  process.exit(0);
}

const grew = problems.filter((p) => p.severity === 'new');
const stale = problems.filter((p) => p.severity === 'stale');

console.error(
  `\n✖ fabricated-money — ${problems.length} problem(s). ${findings.length} finding(s) against a frozen baseline of ${frozenTotal}.\n`,
);

for (const p of grew) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    "${p.text}"`);
  console.error(`    → ${p.rule}`);
  console.error(
    '    → Money on a rendered surface must come from a service response, and a surface with no\n' +
      '      service behind it must render the absence — not a plausible figure. A tick, lot, scale\n' +
      '      or fee is a property of the INSTRUMENT: if it was not published, refuse and say so.\n' +
      '      Never substitute, and never add a row to BASELINE to make this line go away.\n',
  );
}

for (const p of stale) {
  console.error(`  ${p.file}`);
  console.error(`    baseline freezes "${p.text}", which is no longer there`);
  console.error('    → Good — the queue shrank. Delete that string from BASELINE in tooling/ci/fabricated-money-scan.mjs.\n');
}

process.exit(1);
