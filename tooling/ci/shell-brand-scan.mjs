#!/usr/bin/env node
/**
 * SHELL BRAND SCAN — Doctrine §0.7 applied to the product surface, which
 * `brand-scan.mjs` has never once read.
 *
 * ── THE HOLE THIS FILLS, STATED PLAINLY ─────────────────────────────────────
 *
 * `brand-scan.mjs` carries `vendor` in its `SKIP_DIRS`. Its green line —
 * "clean — N files, 0 forbidden names" — has therefore never included a single
 * file of the shell. Every change to the shell that "passed brand-scan" passed
 * a scan that did not open it. That is not a weak gate; for this tree it is no
 * gate at all, and the shell is now the sole product surface, which makes it
 * the one place a partner's name is most likely to reach a user.
 *
 * Measured the first time this ran: 8 occurrences across 4 files, none of them
 * previously visible to any gate.
 *
 * ── WHY A SECOND SCAN RATHER THAN DELETING THAT SKIP ────────────────────────
 *
 * Removing `vendor` from `SKIP_DIRS` was measured before it was rejected. It
 * takes the repo-wide gate from 0 findings to 59, and 51 of those are not
 * product surface at all: compose bind-mount paths, a rebranding script whose
 * entire job is naming what it renames, a market seeder naming Java entity
 * classes and a Mongo database, and the upstream's own attribution documents.
 * Freezing those into the repo-wide ALLOWLIST would double the length of a file
 * ten branches append to, and would bury the eight findings that matter.
 *
 * The second reason is decisive on its own: `brand-scan.mjs`'s `EXTENSIONS`
 * list has no `.vue`. The product surface is 70 single-file components. Even
 * with the skip removed, the shell's actual user-facing markup would still go
 * unread. This scan adds `.vue`, and it can do that without changing what the
 * repo-wide number means for the other 1009 files.
 *
 * ── ONE LIST OF NAMES, NOT TWO ──────────────────────────────────────────────
 *
 * The forbidden names are not restated here. They are PARSED out of
 * `brand-scan.mjs` at run time, so a name added there is enforced here on the
 * same commit, and this file cannot drift into a weaker copy of the rule. If
 * that parse ever yields nothing, this scan FAILS rather than reporting a clean
 * tree it never checked.
 *
 * It also means no forbidden name appears in this file's source, so this file
 * needs no ALLOWLIST entry and stays scanned by the gate it extends. That was
 * deliberate: `brand-scan.mjs` bans the upstream's name in source with no CI
 * exemption, and buying an exemption in order to enforce the rule would be a
 * strange way to strengthen it. The same constraint is why the shell's path is
 * DISCOVERED below and never written down.
 *
 * ── WORD BOUNDARIES ARE RELAXED, AND THAT IS THE POINT ──────────────────────
 *
 * The repo-wide patterns are `\b`-anchored, which is right for our own code: we
 * never embed a vendor's name inside an identifier, so anchoring buys precision
 * for free. In a vendored tree the opposite holds — the name is INSIDE the
 * identifiers, the package names and the filenames. `README.md:1` is the proof:
 * its title carries the upstream name welded to a suffix by an underscore, and
 * `\b` cannot see it because `_` is a word character. Anchored, this scan finds
 * 7 hits; relaxed, 8. The eighth is the title of the product surface's README.
 *
 * Measured cost of relaxing: zero. Across 130 product-surface files the relaxed
 * patterns find the same 7 plus that one, and no false positive.
 *
 * ── WHY A FROZEN BASELINE AND NOT A FIX ─────────────────────────────────────
 *
 * An agent swarm owns this tree at the time of writing, and dual-editing a file
 * somebody else is mid-change on costs more than the day it saves. So this is a
 * RATCHET, the same instrument and the same rules as
 * `fabricated-money-scan.mjs`: today's findings are frozen exactly, the queue
 * can only shrink, and the ninth occurrence fails the build today.
 *
 * This is not a TODO pointing at "later" (§14.8). Every frozen item is written
 * out below, it is enforced on every `pnpm verify`, and it cannot grow. Nothing
 * is ever ADDED to BASELINE to make a build green — a new name on the product
 * surface is fixed by not shipping it.
 *
 * ── WHY THE BASELINE IS HASHED ──────────────────────────────────────────────
 *
 * `fabricated-money-scan.mjs` freezes the exact matched TEXT, because naming
 * the string is the whole point of a ratchet — a count lets a fixed violation
 * and a fresh one cancel out silently. The same is wanted here, but the matched
 * text IS a forbidden name, and writing it down would make this file a
 * violation of the rule it enforces.
 *
 * So rows freeze `sha256(matched text)` truncated to 12 hex, which is exact,
 * order-free and countable in the same way, and carries a written note saying
 * what the string is in plain terms. This is a workaround for a naming ban, not
 * secrecy: the strings are in the tree, and every failure prints them in full.
 *
 * Line numbers are deliberately absent, for the reason the money scan gives:
 * they drift on every edit above them, and a baseline that goes stale for a
 * reason unrelated to branding is a baseline someone deletes.
 *
 * ── A SCAN THAT WALKS NOTHING IS A FAILURE, NOT A PASS ──────────────────────
 *
 * The bug that made this file necessary was a gate reporting success over a
 * tree it never opened. Refusing to repeat that is cheap. Four conditions exit
 * 1 rather than reporting clean: no forbidden names parsed, FEWER parsed than
 * the other file declares, no shell root discovered, or a root found and no
 * files read. A green tick over zero files is the one outcome this scan will
 * not produce — and all four branches have been run and seen to fire, which is
 * a different claim from having written them.
 *
 * Exit 0 = at or below the frozen baseline. Exit 1 = it grew, a row is stale,
 * or nothing was scanned.
 *
 *   node tooling/ci/shell-brand-scan.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const REPO_SCAN = join('tooling', 'ci', 'brand-scan.mjs');

const posix = (p) => p.split(sep).join('/');
const fingerprint = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);

// ── The names, taken from the repo-wide gate rather than restated ───────────

/**
 * Pull `pattern: /…/flags` (and the `reason:` beside it) out of the FORBIDDEN
 * array in `brand-scan.mjs`.
 *
 * A source parse rather than an import, because `brand-scan.mjs` runs its scan
 * and calls `process.exit` at module scope — importing it would run the other
 * gate instead of reading its rules. A source parse rather than a copy, because
 * a copy is a second list, and a second list is one somebody forgets.
 *
 * The failure direction is safe: if the shape of that file changes, this parse
 * finds fewer names or none, and finding none is a hard failure below rather
 * than a clean report.
 */
function forbiddenFromRepoScan() {
  const src = readFileSync(join(ROOT, REPO_SCAN), 'utf8');
  const block = /const FORBIDDEN\s*=\s*\[([\s\S]*?)\n\];/.exec(src);
  if (!block) return { rules: [], declared: 0 };

  /**
   * How many names the other file MEANT to declare, counted independently of
   * whether this parse can read them.
   *
   * Without this, drift is silent in the one direction that matters: the
   * extractor below reads regex LITERALS only, so a name declared any other way
   * is counted by nobody and enforced by nobody, and this scan still prints a
   * green tick over the shorter list.
   *
   * The realistic case is `pattern: new RegExp(…)` — a computed or composed
   * pattern, which is how a list like this usually grows once it gets long. A
   * `pattern: SOME_CONST` reference behaves the same way. (A URL in a literal
   * does NOT: `/` inside a regex literal must be written `\/`, and the extractor
   * handles escapes. That was the first guess when this guard was written, and
   * testing it disproved it — the guard stayed because the real cause is worse,
   * being the one that arrives when someone tidies the list.)
   *
   * "Parsed some" and "parsed all" are not the same claim, so they are not
   * allowed to look the same. A mismatch is a hard failure at the call site.
   */
  const declared = (block[1].match(/^\s*(?:\{\s*)?pattern:/gm) ?? []).length;

  const out = [];
  const declaration = /pattern:\s*\/((?:[^/\\\n]|\\.)+)\/([a-z]*)/g;
  let m;
  while ((m = declaration.exec(block[1])) !== null) {
    const [, source, flags] = m;
    // The reason sits after the pattern in the same object literal; take the
    // first quoted string within a short window and fall back if it is written
    // some other way. A missing reason must not lose the pattern.
    const tail = block[1].slice(m.index, m.index + 600);
    const reason = /reason:\s*(?:'([^']*)'|"([^"]*)")/.exec(tail);
    out.push({
      // `\b` removed: see the header. A vendored tree welds the name into
      // identifiers, and that is exactly where the anchor stops working.
      //
      // Deliberately NOT global. A `g` regex carries `lastIndex` between calls,
      // so a shared one used for a whole-file `.test()` starts the next file
      // part-way through and silently misses early matches. That cost this scan
      // one of its eight findings on the first run — the package name on line 2
      // of the manifest, missed because the lockfile scanned before it left the
      // cursor past it. The per-line global copy is built fresh below.
      pattern: new RegExp(source.replace(/\\b/g, ''), flags.replace('g', '')),
      reason: (reason && (reason[1] ?? reason[2])) || `forbidden name declared in ${posix(REPO_SCAN)}`,
    });
  }
  return { rules: out, declared };
}

// ── The surface, discovered rather than named ───────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.turbo', 'coverage', 'drizzle', '.docker-data', 'target', 'build']);

/**
 * Identical in shape and rationale to `findShellRoots` in
 * `fabricated-money-scan.mjs`: a shell root is any directory holding a Vue 2
 * entry pair — `App.vue` beside `main.js`. That is the signature of an SFC
 * application root and of nothing else vendored here.
 *
 * Not shared as an import, because that file also runs and exits at module
 * scope. Kept identical on purpose; if one of them stops finding the surface,
 * both say so out loud rather than passing.
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
 * `findShellRoots` lands on the `src/` directory. The findings that matter most
 * sit one level ABOVE it — the package manifest carrying the upstream's project
 * name and author address, the lockfile echoing it, the README title. Scanning
 * only `src/` would have missed six of eight. So the scanned unit is the PROJECT
 * root: the parent of the entry pair's directory.
 */
const projectRoots = [...new Set(findShellRoots(join(ROOT, 'vendor')).map((src) => dirname(src)))];

/**
 * `brand-scan.mjs`'s extension list plus `.vue`. The addition is the whole
 * reason this cannot be a flag on the other scan: `.vue` is where the shell's
 * user-facing copy actually lives, and adding it repo-wide is a change to a
 * different gate's meaning.
 */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.mdx', '.html', '.css', '.yaml', '.yml', '.vue'];

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext))) yield full;
  }
}

/**
 * THE FROZEN QUEUE. Every forbidden name on the product surface today, by the
 * `sha256`-12 fingerprint of the exact text that matched. Frozen 2026-08-03 at
 * 4 files / 8 occurrences.
 *
 * Keys are relative to the shell PROJECT root, not the repo root, for the same
 * reason `findShellRoots` exists and with the same benefit: the queue survives
 * the vendor directory being renamed. Findings are still REPORTED at their full
 * repo-relative path, because a path you cannot paste into an editor is not a
 * report.
 *
 * Not fixed here, on purpose: an agent swarm owns this tree, and the four files
 * below are the shell's manifest, lockfile, README and dev-server config —
 * three of which a rename touches anyway. The debt is named so the owner can
 * clear it; delete each row as it goes. Two of the eight are OURS, not the
 * upstream's: the container name in the dev-server config comments was coined
 * by us and welds the vendor's name to our own.
 *
 * A file absent from this map may hold no findings at all. A file present may
 * hold no findings its row does not name. Both directions are enforced, and by
 * multiset — two identical names freeze two rows, so a third is still a
 * failure.
 *
 * @type {Record<string, { fp: string, note: string }[]>}
 */
/* Queue drained 2026-08-09 (L11 wave 5): package/README/config renames.
   A new product-surface hit must be fixed, never re-frozen here. */
const BASELINE = {};

// ── Run ────────────────────────────────────────────────────────────────────

const { rules: FORBIDDEN, declared: DECLARED } = forbiddenFromRepoScan();

/**
 * Four ways this scan can be looking at nothing, or at less than it claims, and
 * all four are failures. A gate that passes over an empty tree is precisely the
 * defect this file exists to remove, so it is refused here rather than reported
 * cheerfully.
 */
if (FORBIDDEN.length === 0) {
  console.error(`\n✖ shell-brand-scan — parsed 0 forbidden names out of ${posix(REPO_SCAN)}.`);
  console.error('  This scan takes its rules from that file and has none. It is not clean; it is blind.');
  console.error('  Fix the FORBIDDEN parse in forbiddenFromRepoScan(), do not ignore this line.\n');
  process.exit(1);
}

if (FORBIDDEN.length !== DECLARED) {
  console.error(`\n✖ shell-brand-scan — ${posix(REPO_SCAN)} declares ${DECLARED} forbidden name(s); this parse read ${FORBIDDEN.length}.`);
  console.error('  Partial is worse than none, because it still prints a green tick over the shorter list.');
  console.error('  The usual cause is a name declared as `new RegExp(…)` or as a reference rather than as a');
  console.error('  regex literal — the extractor reads literals only.');
  console.error('  Fix forbiddenFromRepoScan() until the two numbers agree — do not lower the expectation.\n');
  process.exit(1);
}

if (projectRoots.length === 0) {
  console.error('\n✖ shell-brand-scan — no Vue shell root (App.vue beside main.js) found under vendor/. NOTHING WAS SCANNED.');
  console.error('  If the product surface still exists, discovery is broken — fix findShellRoots.');
  console.error('  If it is genuinely gone, delete this gate deliberately rather than leaving it green over nothing.\n');
  process.exit(1);
}

const findings = [];
let scanned = 0;

for (const root of projectRoots) {
  for (const file of walk(root)) {
    // Reported at the full path (pasteable), keyed at the project-relative one
    // (rename-proof, and sayable without naming the upstream).
    const key = posix(relative(root, file));
    const reported = posix(relative(ROOT, file));
    const content = readFileSync(file, 'utf8');
    scanned++;

    const lines = content.split('\n');
    for (const { pattern, reason } of FORBIDDEN) {
      if (!pattern.test(content)) continue;
      const perLine = new RegExp(pattern.source, pattern.flags + 'g');
      lines.forEach((line, i) => {
        for (const match of line.matchAll(perLine)) {
          findings.push({
            key,
            reported,
            line: i + 1,
            text: match[0],
            fp: fingerprint(match[0]),
            reason,
            context: line.trim().slice(0, 120),
          });
        }
      });
    }
  }
}

/**
 * Roots found, nothing read.
 *
 * Stated honestly: this branch cannot be reached by any change to the SHELL,
 * because the entry pair that identifies a root — `App.vue` and `main.js` — is
 * itself scannable, so a discovered root always yields at least two files. It is
 * reachable only by a change to THIS file: an emptied or narrowed EXTENSIONS
 * list, or a SKIP_DIRS entry that swallows the tree.
 *
 * Kept, and proven to fire (by running a copy with EXTENSIONS emptied against
 * the real tree), because that is exactly the class of edit that produced the
 * bug this scan exists for. The guard costs one comparison and removes the
 * possibility of a green tick over an empty walk.
 */
if (scanned === 0) {
  console.error(`\n✖ shell-brand-scan — found ${projectRoots.length} shell root(s) but walked 0 files. NOTHING WAS SCANNED.`);
  console.error('  A gate that reports clean over an empty walk is the failure this scan exists to prevent.');
  console.error('  Nothing about the product surface can cause this — check EXTENSIONS and SKIP_DIRS in this file.\n');
  process.exit(1);
}

// ── Compare against the frozen queue ───────────────────────────────────────

const byFile = new Map();
for (const hit of findings) {
  if (!byFile.has(hit.key)) byFile.set(hit.key, []);
  byFile.get(hit.key).push(hit);
}

const problems = [];

for (const [key, hits] of byFile) {
  const remaining = (BASELINE[key] ?? []).map((row) => row.fp);
  for (const hit of hits) {
    const at = remaining.indexOf(hit.fp);
    if (at >= 0) remaining.splice(at, 1);
    else problems.push({ severity: 'new', ...hit });
  }
}

for (const [key, frozen] of Object.entries(BASELINE)) {
  const hits = byFile.get(key) ?? [];
  const remaining = hits.map((h) => h.fp);
  for (const row of frozen) {
    const at = remaining.indexOf(row.fp);
    if (at >= 0) remaining.splice(at, 1);
    else problems.push({ severity: 'stale', key, reported: hits[0]?.reported ?? key, fp: row.fp, note: row.note });
  }
}

const frozenTotal = Object.values(BASELINE).reduce((n, rows) => n + rows.length, 0);

if (problems.length === 0) {
  console.log(
    `✓ shell-brand-scan — ${scanned} product-surface file(s), ${FORBIDDEN.length} forbidden name(s) checked, all findings at the frozen baseline`,
  );
  for (const [key, rows] of Object.entries(BASELINE)) {
    const where = byFile.get(key)?.[0]?.reported ?? key;
    console.log(`  ⚠ ${where} — ${rows.length}: ${rows.map((r) => r.note).join('; ')}`);
  }
  // `gates.mjs` prints only the LAST non-empty line as a gate's summary, so the
  // debt has to be on it. A green tick over an unnamed eight is how a frozen
  // queue becomes a forgotten one.
  console.log(
    `  ⚠ ${frozenTotal} forbidden name(s) frozen across ${Object.keys(BASELINE).length} product-surface file(s) — the queue cannot grow. ` +
      'User-facing copy says only: Identity Blueprint · Sovereign Intelligence · Neural Engine.',
  );
  process.exit(0);
}

const grew = problems.filter((p) => p.severity === 'new');
const stale = problems.filter((p) => p.severity === 'stale');

console.error(
  `\n✖ SHELL BRAND SCAN FAILED — ${problems.length} problem(s). ${findings.length} finding(s) against a frozen baseline of ${frozenTotal}.\n`,
);

for (const p of grew) {
  console.error(`  ${p.reported}:${p.line}`);
  console.error(`    ${p.context}`);
  console.error(`    → ${p.reason}`);
  console.error(
    '    → This is the product surface. Remove the name; do NOT add a row to BASELINE —\n' +
      `      that map is a record of debt that predates this gate. (fingerprint ${p.fp})\n`,
  );
}

for (const p of stale) {
  console.error(`  ${p.reported}`);
  console.error(`    baseline freezes ${p.fp} — ${p.note} — which is no longer there`);
  console.error('    → Good — the queue shrank. Delete that row from BASELINE in tooling/ci/shell-brand-scan.mjs.\n');
}

console.error('  User-facing copy says only: Identity Blueprint · Sovereign Intelligence · Neural Engine.\n');
process.exit(1);
