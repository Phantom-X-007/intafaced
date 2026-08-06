#!/usr/bin/env node
/**
 * value-gate — external stamp-mill detector (git-only, no gh, no network).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE GREW A SECOND PATH (2026-08-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * The blocking condition used to be, in full:
 *
 *     const block = docsOnly && nearDup && !hasDelta;
 *
 * `docsOnly` was the FIRST term. So subject similarity was only ever evaluated
 * on a PR whose every path ended in `.md`. Forty-five PRs titled
 * `L3 free-TRK waveN` landed across #832–#876 in two days. Each one touched
 * source, tests, and exactly one slice doc — so `docsOnly === false`, the `&&`
 * short-circuited, and the similarity arm of this gate never ran on a single
 * one of them.
 *
 * What went through, measured on tip: 967 new exported symbols with no
 * non-test caller anywhere in the repo or on 87 remote branches; median
 * function body one line; 7,173 source lines none of which is behind a caller;
 * and after identifier normalisation 67% of the new function bodies are
 * byte-identical to another new function — the same pagination clamp written
 * out character-for-character in nine modules with no shared generic extracted.
 *
 * BE FAIR ABOUT WHAT THIS IS NOT. The tracker was not touched once across those
 * PRs, and nothing user-facing claimed a capability it did not have. Nobody
 * lied. This gate does not punish volume and does not judge taste. Its whole
 * job is to stop NEAR-DUPLICATE WORK BEING COUNTED AS DISTINCT PROGRESS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE, AND WHY IT IS THIS RULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Similarity alone can never be the trigger. Real migrations, per-service
 * rollouts and honest wave work all produce near-identical titles, and a gate
 * that fires on titles would be switched off inside a day. So the code path
 * pairs similarity with ONE further fact:
 *
 *     Does anything outside this change actually call what this change added?
 *
 *   stamp  :=  subject is in a near-duplicate SERIES
 *          &&  the change adds ≥1 new named code symbol
 *          &&  NONE of those symbols is referenced from a non-test file
 *              outside the set of files this change added symbols to
 *          &&  no `Serial-Work:` trailer
 *
 * WHY NOT the byte-identical-body signal instead. It is the louder symptom —
 * and this gate MEASURES it and prints it, because "nine of your thirty-six new
 * bodies are the same body" is the sentence that makes an agent stop. But it
 * cannot be the trigger: a per-rail adapter, a per-service config shim and a
 * migration that lands the same three lines in nine services are all supposed
 * to look identical. Blocking on shape means tuning a triviality allowlist
 * forever, which is a taste judgement wearing a gate's clothes. Reachability is
 * a fact about the repo, not an opinion about the code.
 *
 * WHY NOT "was the tracker or a board moved". Because this repo's own law
 * forbids it: COORDINATION-TRUTH-LAYERS says tracker touch is MOUNTAIN EVENTS
 * ONLY — claim, handoff, done — and explicitly NOT every craft PR under an
 * already-`wip` row. A gate demanding a tracker edit per PR would manufacture
 * exactly the tracker dishonesty the tracker gate exists to prevent. The 45
 * waves were RIGHT to leave it alone. Punishing them for that would be the gate
 * being wrong on the one thing they got right.
 *
 * WHY WARN BEFORE BLOCK. Thrift was rewritten in August because a spend meter
 * masquerading as a correctness gate made agents stop shipping. So the stamp
 * verdict has two tiers and the threshold is stated, not implied:
 *
 *   seriesHits < STAMP_BLOCK_RUN  → WARN, loud, exit 0. First offence is visible.
 *   seriesHits ≥ STAMP_BLOCK_RUN  → BLOCK (strict). Default 3, i.e. the FOURTH
 *                                  near-identical unwired subject in the window.
 *
 * THE ESCAPE, and it is auditable, not silent:
 *
 *   Serial-Work: <why this series is genuinely right>
 *
 * A commit-message trailer, echoed into the CI log by this gate, greppable
 * forever with `git log --grep '^Serial-Work:'`. Deliberately NOT `Board-Delta:`
 * — that trailer is the docs-path escape and is common enough to be invisible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ZERO-WALK GUARD — the named recurring defect in this repo
 * ─────────────────────────────────────────────────────────────────────────────
 * A gate that evaluates nothing and prints clean is worse than no gate. Four
 * gates in this repo exist solely to close that class, and one instance was
 * found inside the wallet gate whose own header cites the defect.
 *
 * This gate had it too, in production. `docs-format.yml` used a bare
 * `actions/checkout@v4`, which is `fetch-depth: 1`. In that checkout
 * `previousSubjects()` catches, returns `[]`, `decide()` compares against an
 * empty array, `best` stays 0, `nearDup` is false, and the gate prints
 * `value-gate: OK` having compared nothing to nothing. `changedFiles()` had the
 * same shape: two `catch {}` blocks that both end in `return []`, and
 * `isDocsOnly([])` is false, so an unreadable diff also printed clean.
 *
 * So: `walkEvidence()` now asserts the gate had something to look at, and a
 * failed walk exits 1 REGARDLESS of advisory mode. Advisory softens a verdict;
 * it must never soften "I could not form one". The workflows fetch depth 0.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Fails when ANY of:
 *   (0) no-op merge: git merge-tree of origin/main + HEAD equals main's tree
 *       (branch already landed / empty squash / superseded — #737 class defect)
 *   (Z) zero-walk: no subject, no diff, no ancestors, or a broken symbol walk
 *   OR ALL of (the DOCS path — unchanged, do not touch, it works):
 *   (a) every changed file is under docs/ or ends with .md
 *   (b) normalised commit subject ≥0.80 similar to any of previous 10 ancestors
 *   (c) no Board-Delta: trailer in the commit body
 *   OR ALL of (the CODE path — new):
 *   (d) series similarity ≥0.80 to a previous ancestor subject
 *   (e) ≥1 new named code symbol, and none of them reached from outside
 *   (f) no Serial-Work: trailer
 *   (g) seriesHits ≥ 3 near-identical ancestors in the 10-commit window
 *       (below that: WARN and exit 0 — the first offence is loud, not fatal)
 *
 * Wired in .github/workflows/docs-format.yml (docs PRs) AND in the `gates` job
 * of .github/workflows/ci.yml (code PRs) — NOT in gates.mjs. It needs git
 * history and an `origin/main` that is actually current, which a laptop
 * `pnpm verify` cannot promise; and ci.yml excludes docs/** while docs-format
 * only fires on markdown, so neither workflow alone can see every PR.
 *
 * Advisory (one cycle): VALUE_GATE_ADVISORY=1 → print, always exit 0 on block.
 * Strict: VALUE_GATE_STRICT=1 or --strict → exit 1 on block.
 * Default without flags: advisory (soft land). Zero-walk ignores both.
 *
 * Self-test: node tooling/ci/value-gate.mjs --self-test
 *
 * Law: S-CORE §3 · BOARD-CLEAR-PROCESS-LOOPS L0 · docs/ops/SWARM-MANDATE.md
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STRICT = process.env.VALUE_GATE_STRICT === '1' || process.argv.includes('--strict') || process.env.VALUE_GATE_ADVISORY === '0';
const BASE = process.env.VALUE_GATE_BASE || 'origin/main';

/**
 * How many near-identical unwired subjects in the ten-commit window before this
 * stops being a warning. 3 means: the second and third of a series WARN in the
 * log, the fourth is red. A number, in one place, so the threshold is a stated
 * fact and not a mood. Counted across the window rather than as a leading run,
 * because one unrelated PR would otherwise reset a mill's counter forever.
 */
export const STAMP_BLOCK_RUN = Number(process.env.VALUE_GATE_BLOCK_RUN || 3);

/** Files whose symbols this gate reasons about. */
const CODE_FILE = /\.(ts|tsx|mjs|cjs|js|jsx)$/;
/** Files that may DEFINE a symbol but never count as a CALLER of one. */
const TEST_FILE = /(\.test\.|\.spec\.|\.d\.ts$|__tests__\/|\/tests?\/|\/fixtures?\/|\/__mocks__\/)/;
/** Pathspecs for the reachability walk — a .vue shell component is a caller. */
const REF_PATHSPECS = ['*.ts', '*.tsx', '*.mjs', '*.cjs', '*.js', '*.jsx', '*.vue'];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).trim();
}

export function normalizeSubject(s) {
  return String(s || '')
    .replace(/\(#[0-9]+\)/g, '')
    .replace(/\b[0-9a-f]{7,40}\b/gi, '')
    .replace(/\bcycle\s*\d+\b/gi, 'cycle N')
    .replace(/\d+/g, 'N')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The SERIES key of a subject: the part that repeats, with the per-instance
 * detail cut off.
 *
 * Plain Dice on the full subject does not see a series. Measured on the 45
 * waves it scored 0.44–0.81 with a median of 0.61, because every title carries
 * a different parenthetical — `(board CSV export line builders)`,
 * `(status-line parse/match/consistency)` — and that tail is most of the
 * string. Raising the threshold to catch 0.61 would have caught unrelated work
 * too; the honest non-wave PRs immediately before them scored 0.31–0.53.
 *
 * Cutting the detail is what separates them. `feat: L3 free-TRK wave45 (…)` and
 * `feat: L3 free-TRK wave12 (…)` both reduce to `feat ln free trk waven` —
 * identical, because `normalizeSubject` already collapses the counter. The
 * conventional-commit scope is kept: `feat(academy):` and `feat(pay):` must not
 * become the same series.
 *
 * Falls back to the full normalised subject when the stem is too short to mean
 * anything, so a bare `fix: typo` cannot collide with everything.
 */
export function seriesStem(subject) {
  let s = String(subject || '').replace(/\(#[0-9]+\)\s*$/, '');
  const sep = s.indexOf(': ');
  const head = sep >= 0 ? s.slice(0, sep + 2) : '';
  let tail = sep >= 0 ? s.slice(sep + 2) : s;
  tail = tail.split(/\s[—–-]\s/)[0];
  const paren = tail.indexOf('(');
  if (paren > 0) tail = tail.slice(0, paren);
  const stem = normalizeSubject(head + tail);
  return stem.length >= 12 ? stem : normalizeSubject(subject);
}

/** Dice coefficient on bigrams — short titles, zero deps. */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [g, c] of A) inter += Math.min(c, B.get(g) || 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

/** Series similarity of two RAW subjects: the better of whole-title and stem. */
export function seriesSimilarity(a, b) {
  return Math.max(similarity(normalizeSubject(a), normalizeSubject(b)), similarity(seriesStem(a), seriesStem(b)));
}

export function isDocsOnly(files) {
  if (!files.length) return false;
  return files.every((f) => f.startsWith('docs/') || f.endsWith('.md') || f === 'NOTICE' || f === 'LICENSE');
}

export function hasBoardDeltaTrailer(body) {
  return /^Board-Delta:\s*\S+/im.test(body || '');
}

/** `Key-Name: value` — the shape of a git trailer line. */
const TRAILER_LINE = /^[A-Za-z][A-Za-z0-9-]*:[ \t]/;

/**
 * The code-path escape. Explicit, auditable, and it has to say something:
 * `Serial-Work:` with nothing after it is not a reason.
 *
 * It must also be a TRAILER, not a sentence. The commit that added the merge-ref
 * fix on this very branch wrapped mid-paragraph as
 *
 *     ...the body searched for Board-Delta: and
 *     Serial-Work: was the merge commit's, which has none.
 *
 * and a plain `/^Serial-Work:/m` read that prose as a valid escape and printed
 * it as the audit reason. An escape that can be triggered by describing the
 * escape is not an escape. So the line must begin a block or follow another
 * trailer — never continue prose.
 */
export function serialWorkReason(body) {
  const lines = String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^Serial-Work:[ \t]*(\S.*?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const prev = i === 0 ? '' : lines[i - 1];
    if (prev.trim() !== '' && !TRAILER_LINE.test(prev)) continue;
    if (m[1].length >= 8) return m[1];
  }
  return null;
}

// ── new named symbols ───────────────────────────────────────────────────────

const DECLARATIONS = [
  /^\+\s*export\s+(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/,
  /^\+\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\+\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
];
/** An indented `name(args…) {` — a class or object method. Not a call: those end in `;`. */
const METHOD =
  /^\+\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\(/;
const NOT_A_NAME = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'constructor',
  'function',
  'super',
  'this',
  'typeof',
  'await',
  'new',
  'do',
  'else',
  'throw',
  'yield',
  'delete',
  'void',
]);

/**
 * New named symbols introduced by a unified=0 diff, as `{ name, file }`.
 *
 * Both `export function foo` and a method added to an exported class count — the
 * 45 waves used both, and a gate that only saw `export function` would have
 * missed every `MemoryResidencyDesk.safePageOpenApplicationIds` in the set.
 * Symbols defined in test files are not collected: a helper that only tests use
 * is not the thing this gate is asking about.
 *
 * Over-collection is the SAFE direction here. A spurious extra name can only
 * make a change look MORE wired (one reached symbol is enough to pass); it can
 * never invent a block on its own.
 *
 * @param {string} diffText output of `git diff --unified=0`
 */
export function newNamedSymbols(diffText) {
  const found = [];
  const seen = new Set();
  let file = '';
  for (const line of String(diffText || '').split('\n')) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) {
      file = header[1] === 'dev/null' ? '' : header[1];
      continue;
    }
    if (!file || !CODE_FILE.test(file) || TEST_FILE.test(file)) continue;
    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    let name = null;
    for (const re of DECLARATIONS) {
      const m = re.exec(line);
      if (m) {
        name = m[1];
        break;
      }
    }
    if (!name && !/;\s*$/.test(line)) {
      const m = METHOD.exec(line);
      if (m && !NOT_A_NAME.has(m[1])) name = m[1];
    }
    if (!name) continue;
    const key = `${file}::${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ name, file });
  }
  return found;
}

/** `export * from './x'` / `export { a, b } from './x'` — a barrel hop, not a caller. */
export function isPureReExport(lineContent) {
  return /^\s*export\s+(?:\*|type\s+\*|\{[^}]*\})\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?from\s/.test(lineContent || '');
}

/**
 * Which of `symbols` are reached, given raw `git grep -n` output lines.
 *
 * A reference counts only when it comes from a file that is
 *   · not a test file, and
 *   · not one of the files this change added symbols to, and
 *   · not a pure re-export line.
 *
 * The second clause is the one that matters and it is deliberate on both sides.
 * Excluding the whole new-symbol SURFACE (not merely the defining file) closes
 * the obvious dodge: nine new helpers that only call each other are still nine
 * helpers nothing calls. Excluding only the new-symbol files — rather than
 * every file the diff touched — is what keeps honest work green: a PR that adds
 * a handler and wires it into an existing router still passes, because the
 * router gained no new symbol of its own and therefore still counts as outside.
 *
 * @param {string[]} grepLines lines shaped `path:lineno:content`
 * @param {{name:string,file:string}[]} symbols
 */
export function reachedSymbols(grepLines, symbols) {
  const defFiles = new Set(symbols.map((s) => s.file));
  const names = [...new Set(symbols.map((s) => s.name))];
  const reached = new Set();
  for (const raw of grepLines) {
    if (!raw) continue;
    const first = raw.indexOf(':');
    if (first < 0) continue;
    const rest = raw.slice(first + 1);
    const second = rest.indexOf(':');
    if (second < 0) continue;
    const path = raw.slice(0, first);
    const content = rest.slice(second + 1);
    if (TEST_FILE.test(path) || defFiles.has(path)) continue;
    if (isPureReExport(content)) continue;
    for (const n of names) {
      if (reached.has(n)) continue;
      if (new RegExp(`(^|[^\\w$])${n}([^\\w$]|$)`).test(content)) reached.add(n);
    }
  }
  return [...reached];
}

// ── duplicate bodies (EVIDENCE ONLY — never gates) ──────────────────────────

const SHAPE_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'return',
  'const',
  'let',
  'var',
  'function',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'new',
  'delete',
  'typeof',
  'instanceof',
  'in',
  'of',
  'this',
  'super',
  'try',
  'catch',
  'finally',
  'throw',
  'await',
  'async',
  'yield',
  'export',
  'import',
  'from',
  'as',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'readonly',
  'public',
  'private',
  'protected',
  'static',
  'get',
  'set',
  'number',
  'string',
  'boolean',
  'any',
  'unknown',
  'never',
  'Math',
  'Number',
  'Object',
  'Array',
  'String',
  'Boolean',
  'Set',
  'Map',
  'JSON',
  'Date',
  'Promise',
  'Infinity',
  'NaN',
]);

/** Identifier-normalised shape of one line: names → x, numbers → N, strings → S. */
export function normalizeBodyLine(line) {
  return String(line)
    .replace(/\/\/.*$/, '')
    .replace(/\bthis\./g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, 'S')
    .replace(/\b\d[\w.]*\b/g, 'N')
    .replace(/[A-Za-z_$][\w$]*/g, (id) => (SHAPE_KEYWORDS.has(id) ? id : 'x'))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clusters of added bodies that are byte-identical after identifier
 * normalisation. EVIDENCE, printed in the warning — never part of the verdict.
 * See the header for why shape cannot be the trigger.
 *
 * Blocks are split on blank added lines and on doc-comment openers, and the
 * signature line is dropped before hashing: `safePageOpenApplicationIds` and
 * `safePageCurriculumSlugs` differ only in their name and their one call, and
 * the point is that the six lines underneath are the same six lines.
 */
export function duplicateBodyClusters(diffText, minBodyLines = 3) {
  const byHash = new Map();
  let file = '';
  let block = [];
  const flush = () => {
    if (block.length >= minBodyLines + 1) {
      const body = block
        .slice(1)
        .map(normalizeBodyLine)
        .filter((l) => l && l !== '}' && l !== '{');
      if (body.length >= minBodyLines) {
        const key = body.join('\n');
        if (!byHash.has(key)) byHash.set(key, []);
        byHash.get(key).push(`${file}:${block[0].trim().slice(0, 60)}`);
      }
    }
    block = [];
  };
  for (const line of String(diffText || '').split('\n')) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) {
      flush();
      file = header[1];
      continue;
    }
    if (line.startsWith('@@')) {
      flush();
      continue;
    }
    if (!file || !CODE_FILE.test(file) || TEST_FILE.test(file)) continue;
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const text = line.slice(1);
    if (!text.trim() || /^\s*\/\*/.test(text)) {
      flush();
      continue;
    }
    if (/^\s*[*]/.test(text)) continue;
    block.push(text);
  }
  flush();
  return [...byHash.values()].filter((members) => members.length > 1);
}

// ── no-op branch (#737 class) ───────────────────────────────────────────────

/**
 * True when merging `headRef` into `baseRef` produces base's own tree.
 * That means the branch adds nothing — already on main, empty squash, or superseded.
 * Uses `git merge-tree --write-tree` (git-only, no network). Conflicts ⇒ not a no-op.
 *
 * @param {string} baseRef
 * @param {string} headRef
 * @param {(args: string[]) => { failed: boolean, stdout: string }} [run] injectable for tests
 */
export function isNoOpOntoBase(baseRef, headRef, run = gitMergeTree) {
  // A run ON the base is not a branch. After a squash merge the workflow fires
  // again with HEAD === origin/main, and "merging" main into main trivially
  // yields main's own tree — so every merge painted the base's own CI run red
  // with `FAIL — branch adds nothing`. The question this gate asks only has
  // meaning for a head that is not the base.
  const baseCommit = run(['rev-parse', baseRef]);
  const headCommit = run(['rev-parse', headRef]);
  if (!baseCommit.failed && !headCommit.failed) {
    const b = baseCommit.stdout.trim().split('\n')[0].trim();
    const h = headCommit.stdout.trim().split('\n')[0].trim();
    if (b && h && b === h) return false;
  }

  const main = run(['rev-parse', `${baseRef}^{tree}`]);
  if (main.failed || !main.stdout.trim()) return false;
  const mainTree = main.stdout.trim().split('\\n')[0].trim();
  const merged = run(['merge-tree', '--write-tree', baseRef, headRef]);
  if (merged.failed) return false;
  const tree = merged.stdout.trim().split('\\n')[0].trim();
  return Boolean(tree) && tree === mainTree;
}

function gitMergeTree(args) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    failed: r.status !== 0,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

// ── zero-walk guard ─────────────────────────────────────────────────────────

/**
 * Every reason this run had NOTHING to evaluate. Empty array ⇒ the gate really
 * did look at something. Non-empty ⇒ exit 1, in advisory mode too.
 *
 * This is not defensive padding. Under a `fetch-depth: 1` checkout — the
 * `actions/checkout@v4` default, which is what docs-format.yml used — this gate
 * printed `value-gate: OK` on every PR while comparing an empty subject list to
 * an empty subject list. See the header.
 */
export function walkEvidence({ subject, files, prevSubjects, symbolWalkError }) {
  const reasons = [];
  if (!String(subject || '').trim()) {
    reasons.push('no commit subject — `git log -1 --pretty=%s` returned nothing');
  }
  if (!files || files.length === 0) {
    reasons.push('no changed files — the diff walk produced zero paths, so docsOnly and the symbol walk are both meaningless');
  }
  if (!prevSubjects || prevSubjects.length === 0) {
    reasons.push('no previous subjects — similarity was compared against an empty list (shallow clone? needs fetch-depth: 0)');
  }
  if (symbolWalkError) {
    reasons.push(`the reachability walk did not run: ${symbolWalkError}`);
  }
  return reasons;
}

// ── the decision ────────────────────────────────────────────────────────────

/**
 * Pure decision — the thing CI enforces.
 *
 * @param {object} input
 * @param {string[]} input.files
 * @param {string} input.subject
 * @param {string} input.body
 * @param {string[]} input.prevSubjects most-recent-ancestor first
 * @param {{name:string,file:string}[]} [input.newSymbols]
 * @param {string[]} [input.reached] names of new symbols with an outside caller
 * @param {number} [input.dupBodyClusters] evidence only
 */
export function decide({
  files,
  subject,
  body,
  prevSubjects,
  threshold = 0.8,
  newSymbols = [],
  reached = [],
  dupBodyClusters = 0,
  blockRun = STAMP_BLOCK_RUN,
}) {
  const docsOnly = isDocsOnly(files);
  const norm = normalizeSubject(subject);
  const rawPrev = prevSubjects || [];
  const prev = rawPrev.map(normalizeSubject);

  // ── DOCS PATH — byte-for-byte the rule that has worked since #722. Untouched.
  let best = 0;
  let bestPrev = '';
  let bestRaw = '';
  for (let i = 0; i < prev.length; i++) {
    const s = similarity(norm, prev[i]);
    if (s > best) {
      best = s;
      bestPrev = prev[i];
      bestRaw = rawPrev[i] || prev[i];
    }
  }
  const nearDup = best >= threshold;
  const hasDelta = hasBoardDeltaTrailer(body);
  const docsBlock = docsOnly && nearDup && !hasDelta;

  // ── CODE PATH — series similarity, evaluated regardless of docsOnly.
  let seriesBest = 0;
  let seriesRaw = '';
  for (let i = 0; i < rawPrev.length; i++) {
    const s = seriesSimilarity(subject, rawPrev[i]);
    if (s > seriesBest) {
      seriesBest = s;
      seriesRaw = rawPrev[i];
    }
  }
  // How many of the ancestors in the window belong to this series — counted
  // ACROSS the window, not as a leading run. A consecutive counter is reset by
  // one unrelated PR, so alternating mill/real/mill/real would have warned
  // forever and never blocked. On #832–#876 the two definitions give the same
  // answer at every commit; they differ only on the mill that tries to dodge.
  let seriesHits = 0;
  for (let i = 0; i < rawPrev.length; i++) {
    if (seriesSimilarity(subject, rawPrev[i]) >= threshold) seriesHits++;
  }
  const inSeries = seriesBest >= threshold;
  const symbolCount = (newSymbols || []).length;
  const reachedCount = (reached || []).length;
  // symbolCount === 0 makes this arm inert — docs-only and pure-refactor PRs
  // never reach it, which is why the docs rule above needs no guard against it.
  const unwired = symbolCount > 0 && reachedCount === 0;
  const serialWork = serialWorkReason(body);
  const stamp = inSeries && unwired && !serialWork;
  const codeBlock = stamp && seriesHits >= blockRun;
  const codeWarn = stamp && !codeBlock;

  return {
    block: docsBlock || codeBlock,
    docsBlock,
    codeBlock,
    codeWarn,
    stamp,
    best,
    bestPrev,
    bestRaw,
    nearDup,
    docsOnly,
    hasDelta,
    norm,
    seriesBest,
    seriesRaw,
    seriesHits,
    inSeries,
    symbolCount,
    reachedCount,
    unwired,
    serialWork,
    dupBodyClusters,
    blockRun,
  };
}

// ── git walks ───────────────────────────────────────────────────────────────

/**
 * Resolve the diff ONCE — the range AND the file list together.
 *
 * These used to be two functions with two different fallback policies:
 * `changedFiles` tried `base...HEAD` and then quietly retried `HEAD~1..HEAD`,
 * while the symbol walk was handed only the first range and never learned about
 * the retry. So a run where the primary range was empty reported a full file
 * list from the fallback and ZERO new symbols from the primary — two views of
 * one diff, and the code arm silently inert. One resolver, one answer.
 *
 * `range === null` means neither candidate produced anything, which is a
 * zero-walk condition and not a pass.
 */
function resolveDiff(base) {
  const candidates = [];
  try {
    git(['rev-parse', '--verify', `${base}^{commit}`]);
    candidates.push(`${base}...HEAD`);
  } catch {
    /* base is not resolvable here — shallow clone, or a fork without the ref */
  }
  candidates.push('HEAD~1..HEAD');

  for (const range of candidates) {
    try {
      const out = git(['diff', '--name-only', range]);
      if (out) return { range, files: out.split('\n').filter(Boolean) };
    } catch {
      /* try the next candidate */
    }
  }
  return { range: null, files: [] };
}

/**
 * `Merge <sha> into <sha>` — the subject of the synthetic commit GitHub builds
 * at `refs/pull/N/merge`, which is what `actions/checkout` checks out on a
 * `pull_request` event.
 *
 * THIS MATTERED. The first real CI run of this gate printed:
 *
 *   subject: Merge bd183ef5… into f143df7b…
 *   nearDup=false (best=0.133)  inSeries=false (series=0.133)
 *
 * It was scoring a machine-generated merge title against real commit subjects.
 * `normalizeSubject` strips 7–40 char hex, so EVERY pull request reduces to the
 * same three words `merge into` — never similar to anything a human wrote, and
 * identical to every other PR. Both arms of the gate were dead on the event
 * they exist to run on, and the body it read for the trailers was empty, so
 * `Board-Delta:` and `Serial-Work:` could never have been found either.
 */
export function isSyntheticMergeSubject(subject) {
  return /^Merge\s+[0-9a-f]{7,40}\s+into\s+[0-9a-f]{7,40}$/i.test(String(subject || '').trim());
}

/**
 * The commit whose SUBJECT and BODY this gate is judging. `HEAD`, except on a
 * PR merge ref, where the PR's own head is the second parent.
 */
function resolveHeadRef() {
  let subject = '';
  try {
    subject = git(['log', '-1', '--pretty=%s', 'HEAD']);
  } catch {
    return 'HEAD';
  }
  if (!isSyntheticMergeSubject(subject)) return 'HEAD';
  try {
    // parent1 is the base, parent2 is the PR head. Two parents, or it is not
    // the shape we think it is and we leave it alone.
    const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/).length - 1;
    if (parents !== 2) return 'HEAD';
    git(['rev-parse', '--verify', 'HEAD^2']);
    return 'HEAD^2';
  } catch {
    return 'HEAD';
  }
}

/** Last n subjects before `ref` (ancestry — sequential stamps on a branch + mill on main). */
function previousSubjects(ref, n = 10) {
  try {
    const out = git(['log', ref, `-${n + 1}`, '--pretty=%s']);
    const lines = out ? out.split('\n').filter(Boolean) : [];
    return lines.slice(1);
  } catch {
    return [];
  }
}

/** Squash a git error into one printable line — the zero-walk report is a list. */
function oneLine(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * The reachability walk. Returns `{ symbols, reached, dupClusters, error }`.
 * `error` non-null is a ZERO-WALK condition, not a pass.
 */
function symbolWalk(range) {
  if (!range)
    return { symbols: [], reached: [], dupClusters: 0, error: 'no usable diff range — neither the base nor HEAD~1 produced a diff' };
  let diffText = '';
  try {
    diffText = execFileSync('git', ['diff', '--unified=0', '--no-color', range, '--', '*.ts', '*.tsx', '*.mjs', '*.cjs', '*.js', '*.jsx'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1 << 28,
    });
  } catch (e) {
    return {
      symbols: [],
      reached: [],
      dupClusters: 0,
      error: `git diff --unified=0 ${range} failed: ${oneLine(e.message || e)}`,
    };
  }

  const symbols = newNamedSymbols(diffText);
  const dupClusters = duplicateBodyClusters(diffText).length;
  if (symbols.length === 0) return { symbols, reached: [], dupClusters, error: null };

  // One grep, all names. Capped so the argv stays sane; if ANY of the first
  // 150 is reached the change is wired, so the cap cannot invent a block.
  const names = [...new Set(symbols.map((s) => s.name))].slice(0, 150);
  const args = ['grep', '--no-color', '-n', '-w', '-F', '-I'];
  for (const n of names) args.push('-e', n);
  args.push('--', ...REF_PATHSPECS);
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  // git grep: 0 = matches, 1 = no matches, >1 = real failure.
  if (r.status !== 0 && r.status !== 1) {
    return { symbols, reached: [], dupClusters, error: `git grep exited ${r.status}: ${oneLine(r.stderr)}` };
  }
  const lines = (r.stdout || '').split('\n').filter(Boolean);
  return { symbols, reached: reachedSymbols(lines, symbols), dupClusters, error: null };
}

// ── self-test ───────────────────────────────────────────────────────────────

function selfTest() {
  const fails = [];
  const names = [];
  const assert = (cond, msg) => {
    if (!cond) fails.push(msg);
  };
  const fixture = (name) => names.push(name);

  const stampA = 'docs(ops): R07 cycle 107 freeProduct=0 tip a8ca0e3f';
  const stampB = 'docs(ops): R07 cycle 108 freeProduct=0 tip 2adb5354';
  const stampPrev = [
    stampA,
    'docs(ops): R01 babysit cycle106 ready=4 tip deadbeef',
    'docs(ops): R07 cycle105 freeProduct=0 board unchanged',
  ];
  const blockCase = decide({
    files: ['docs/ops/R07-PEACE.md', 'docs/ops/FREEZE-LIVE.md'],
    subject: stampB,
    body: `${stampB}\n\nre-freeze only\n`,
    prevSubjects: stampPrev,
  });
  assert(blockCase.docsOnly === true, 'stamp: docsOnly');
  assert(blockCase.nearDup === true, `stamp: nearDup (sim=${blockCase.best.toFixed(3)})`);
  assert(blockCase.hasDelta === false, 'stamp: no Board-Delta');
  assert(blockCase.block === true, 'stamp: must BLOCK (exit 1 path)');
  assert(blockCase.best >= 0.8, `stamp: sim>=0.80 got ${blockCase.best}`);
  fixture('near-dup docs-only no Board-Delta → BLOCK (exit 1 path)');

  const withDelta = decide({
    files: ['docs/ops/R07-PEACE.md'],
    subject: stampB,
    body: `${stampB}\n\nBoard-Delta: partner PR #433 went red on Tests\n`,
    prevSubjects: stampPrev,
  });
  assert(withDelta.block === false, 'Board-Delta must clear the block');
  assert(withDelta.hasDelta === true, 'Board-Delta detected');
  fixture('near-dup + Board-Delta → PASS');

  // A code PR with a similar title that WIRED what it added. This is the
  // fixture that has to stay green or the gate gets switched off: its stem is
  // identical to its predecessor's, so it is `inSeries`, and it passes purely
  // because something outside calls the new symbol.
  const realCode = decide({
    files: ['services/svc-pay/src/index.ts', 'services/svc-pay/src/index.test.ts'],
    subject: 'feat(pay): M1 pay.gateway Done bar — card sandbox',
    body: 'feat(pay): M1 pay.gateway Done bar — card sandbox\n',
    prevSubjects: ['feat(pay): M1 pay.gateway Done bar — card sandbox prior'],
    newSymbols: [{ name: 'chargeCard', file: 'services/svc-pay/src/index.ts' }],
    reached: ['chargeCard'],
  });
  assert(realCode.docsOnly === false, 'code: not docsOnly');
  assert(realCode.inSeries === true, `code: stem puts it in a series (sim=${realCode.seriesBest.toFixed(3)})`);
  assert(realCode.unwired === false, 'code: symbol is reached');
  assert(realCode.block === false, 'code: must PASS');
  assert(realCode.codeWarn === false, 'code: must not even warn');
  fixture('code change, near-identical title, symbol reached → PASS (legitimate serial work)');

  const realDocs = decide({
    files: ['docs/MONEY-BASELINE.md'],
    subject: 'docs: money baseline residual 10→0 after ledger recipes',
    body: 'docs: money baseline residual 10→0 after ledger recipes\n',
    prevSubjects: stampPrev,
  });
  assert(realDocs.docsOnly === true, 'real docs: docsOnly');
  assert(realDocs.nearDup === false, `real docs: not nearDup (sim=${realDocs.best.toFixed(3)})`);
  assert(realDocs.block === false, 'real docs: must PASS');
  fixture('unique docs title → PASS');

  assert(
    normalizeSubject('docs(ops): R07 cycle 99 tip abcdef1 (#711)') === normalizeSubject('docs(ops): R07 cycle 1 tip deadbeef (#1)'),
    'normalise: cycle/sha/pr collapse',
  );

  // ── THE HOLE THIS CHANGE CLOSES ──────────────────────────────────────────
  // Real subjects and real file lists from #832–#876. `docsOnly` is false
  // because of the one slice doc, which is exactly why the old rule never ran.
  const waveSubjects = [
    'feat: L3 free-TRK wave44 (status lines + required-channels/xp board) (#875)',
    'feat: L3 free-TRK wave43 (mute/digest/progress/xp/bulk board+export) (#874)',
    'feat: L3 free-TRK wave42 (export parse/validate + round-trip checks) (#873)',
    'feat: L3 free-TRK wave41 (board CSV export line builders) (#872)',
    'feat: L3 free-TRK wave40 (safe clamped board pagination guards) (#871)',
  ];
  const waveFiles = [
    'docs/ops/slices/L3-2026-08-06-free-trk-wave45.md',
    'services/svc-academy/src/curriculum/catalog.ts',
    'services/svc-academy/src/curriculum/catalog.test.ts',
  ];
  const waveSubject = 'feat: L3 free-TRK wave45 (status-line parse/match/consistency) (#876)';
  const waveBody = `${waveSubject}\n\n## Board-Delta\nL3 Class N free-TRK wave45.\n`;
  const waveSymbols = [
    { name: 'parseCatalogStatusLine', file: 'services/svc-academy/src/curriculum/catalog.ts' },
    { name: 'catalogStatusLineMatches', file: 'services/svc-academy/src/curriculum/catalog.ts' },
  ];

  const wave = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(wave.docsOnly === false, 'wave: docsOnly is FALSE — this is why the old rule never fired');
  assert(wave.nearDup === false, `wave: whole-title Dice misses it (${wave.best.toFixed(3)}) — the stem is what sees the series`);
  assert(wave.inSeries === true, `wave: series similarity catches it (${wave.seriesBest.toFixed(3)})`);
  assert(wave.seriesHits === 5, `wave: 5 siblings in the window, got ${wave.seriesHits}`);
  assert(wave.unwired === true, 'wave: no new symbol reached from outside');
  assert(wave.codeBlock === true, 'wave: 5 siblings ≥ 3 → must BLOCK');
  assert(wave.block === true, 'wave: block');
  fixture('code near-dup series + zero reached symbols + 5 siblings → BLOCK (the #832–#876 shape)');

  // First offence: same shape, run of 1. Loud, but green.
  const firstOffence = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: [waveSubjects[0], 'fix(ci): the auth gate never read a version (#819)'],
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(firstOffence.stamp === true, 'first offence: is a stamp');
  assert(firstOffence.seriesHits === 1, `first offence: 1 sibling, got ${firstOffence.seriesHits}`);
  assert(firstOffence.codeWarn === true, 'first offence: must WARN');
  assert(firstOffence.codeBlock === false, 'first offence: must NOT block');
  assert(firstOffence.block === false, 'first offence: exit 0');
  fixture('code near-dup series + zero reached symbols + 1 sibling → WARN, exit 0 (warn before block)');

  // Threshold is a stated number, not a mood: 2 siblings warn, 3 block.
  const atThreshold = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: waveSubjects.slice(0, 3),
    newSymbols: waveSymbols,
    reached: [],
  });
  const belowThreshold = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: [...waveSubjects.slice(0, 2), 'fix(ci): unrelated (#819)'],
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(atThreshold.seriesHits === 3 && atThreshold.codeBlock === true, `threshold: 3 siblings blocks (got ${atThreshold.seriesHits})`);
  assert(
    belowThreshold.seriesHits === 2 && belowThreshold.codeWarn === true,
    `threshold: 2 siblings warns (got ${belowThreshold.seriesHits})`,
  );
  fixture(`stated threshold — ${STAMP_BLOCK_RUN - 1} near-identical ancestors WARNs, ${STAMP_BLOCK_RUN} BLOCKs`);

  // Counted across the window, not as a leading run. A mill that alternates
  // mill / real / mill / real would reset a consecutive counter on every other
  // PR and warn forever without ever blocking. Interleaving must not launder it.
  const interleaved = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: [
      'fix(ci): unrelated (#819)',
      waveSubjects[0],
      'chore(deps): bump prettier (#818)',
      waveSubjects[1],
      'docs: money baseline (#817)',
      waveSubjects[2],
    ],
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(interleaved.seriesHits === 3, `interleave: 3 siblings across the window, got ${interleaved.seriesHits}`);
  assert(interleaved.codeBlock === true, 'interleave: an unrelated PR between stamps must not reset the counter');
  fixture('siblings counted across the 10-commit window — interleaving unrelated PRs does not launder a mill');

  // The PR merge ref. Caught by reading the FIRST real CI run of this gate,
  // which scored `Merge bd183ef5… into f143df7b…` against real subjects and
  // reported inSeries=false at 0.133. Every PR reduces to `merge into` once the
  // hex is normalised away, so both arms were dead on the event they run on —
  // and the body read for the trailers was the merge commit's, which is empty.
  const mergeSubject = 'Merge bd183ef569c106b1eb641a56c50e73f97db8d21e into f143df7bda17283637df985638d0bd9f9c92c2cf';
  assert(isSyntheticMergeSubject(mergeSubject) === true, 'merge ref: the synthetic PR merge subject is recognised');
  assert(isSyntheticMergeSubject('Merge branch main into feat/x') === false, 'merge ref: a human merge subject is NOT the synthetic shape');
  assert(isSyntheticMergeSubject(waveSubject) === false, 'merge ref: an ordinary subject is not a merge ref');
  assert(
    normalizeSubject(mergeSubject) ===
      normalizeSubject('Merge 1111111111111111111111111111111111111111 into 2222222222222222222222222222222222222222'),
    'merge ref: every PR merge subject normalises to the same string — which is why reading it was fatal',
  );
  fixture('isSyntheticMergeSubject — the PR merge ref is detected so the gate judges the PR head, not "Merge <sha> into <sha>"');

  // The escape, and its floor. A bare `Serial-Work:` is not a reason.
  const escaped = decide({
    files: waveFiles,
    subject: waveSubject,
    body: `${waveBody}\nSerial-Work: per-service rollout of the rail adapter, one service per PR by design\n`,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: [],
  });
  const emptyEscape = decide({
    files: waveFiles,
    subject: waveSubject,
    body: `${waveBody}\nSerial-Work:\n`,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(escaped.block === false, 'escape: Serial-Work with a reason clears the block');
  assert(escaped.serialWork.startsWith('per-service rollout'), 'escape: reason captured for the audit log');
  assert(emptyEscape.block === true, 'escape: an empty Serial-Work trailer is not an escape');
  fixture('Serial-Work: <reason> → PASS · bare Serial-Work: → still BLOCK (auditable escape)');

  // An escape that can be triggered by DESCRIBING the escape is not an escape.
  // This exact body shipped on this branch and opened the gate by accident.
  const prosePrev = 'this is a sentence about the body searched for Board-Delta: and';
  const proseWrap = decide({
    files: waveFiles,
    subject: waveSubject,
    body: `${waveBody}\n${prosePrev}\nSerial-Work: was the merge commit's, which has none.\n`,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(proseWrap.serialWork === null, 'escape: a wrapped prose line beginning "Serial-Work:" is NOT a trailer');
  assert(proseWrap.block === true, 'escape: prose must not open the gate');
  const afterTrailer = decide({
    files: waveFiles,
    subject: waveSubject,
    body: `${waveBody}\nBoard-Delta: something real\nSerial-Work: per-service rollout, one service per PR by design\n`,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: [],
  });
  assert(afterTrailer.block === false, 'escape: a trailer following another trailer is still a trailer');
  fixture('Serial-Work must be a trailer, not a sentence — wrapped prose does not open the gate');

  // Same series, but this one wired something. The gate must stay off it.
  const wiredWave = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: ['parseCatalogStatusLine'],
  });
  assert(wiredWave.inSeries === true, 'wired wave: still in the series');
  assert(wiredWave.unwired === false, 'wired wave: one reached symbol is enough');
  assert(wiredWave.block === false && wiredWave.codeWarn === false, 'wired wave: must PASS silently');
  fixture('same series, one symbol reached → PASS (similarity alone never blocks)');

  // A PR that adds no new symbol at all — a refactor, a rename, a test-only
  // change — can never be a code stamp, whatever its title looks like.
  const noSymbols = decide({
    files: ['services/svc-pay/src/index.ts'],
    subject: waveSubject,
    body: waveBody,
    prevSubjects: waveSubjects,
    newSymbols: [],
    reached: [],
  });
  assert(noSymbols.inSeries === true, 'no-symbol: in series');
  assert(noSymbols.unwired === false && noSymbols.block === false, 'no-symbol: must PASS');
  fixture('near-dup title but no new symbols (refactor/rename) → PASS');

  // ── stem normalisation ───────────────────────────────────────────────────
  assert(
    seriesStem('feat: L3 free-TRK wave45 (status-line parse/match/consistency) (#876)') ===
      seriesStem('feat: L3 free-TRK wave12 (bottom-N, seasons, residency) (#843)'),
    'stem: waveN titles collapse to one series key',
  );
  assert(
    seriesStem('feat(academy): L3 certs progress report') !== seriesStem('feat(pay): L3 certs progress report'),
    'stem: conventional-commit scope is preserved',
  );
  assert(
    similarity(
      normalizeSubject('feat: L3 free-TRK wave45 (status-line parse/match/consistency)'),
      normalizeSubject('feat: L3 free-TRK wave12 (bottom-N, seasons, residency)'),
    ) < 0.8,
    'stem: whole-title Dice on those two is BELOW threshold — the stem is load-bearing',
  );
  fixture('seriesStem — 45 wave titles collapse to one key, scopes stay distinct');

  // ── symbol extraction ────────────────────────────────────────────────────
  const diffFixture = [
    'diff --git a/services/svc-academy/src/curriculum/catalog.ts b/services/svc-academy/src/curriculum/catalog.ts',
    '--- a/services/svc-academy/src/curriculum/catalog.ts',
    '+++ b/services/svc-academy/src/curriculum/catalog.ts',
    '@@ -1023,0 +1024,8 @@',
    '+/** L3 — safe page spine slugs with clamped bounds. */',
    '+export function safePageCurriculumSlugs(offset: number, limit: number): readonly string[] {',
    '+  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return [];',
    '+  const all = listCurriculumSlugs();',
    '+  const o = Math.max(0, Math.min(all.length, Math.floor(offset)));',
    '+  const l = Math.max(0, Math.min(all.length - o, Math.floor(limit)));',
    '+  return all.slice(o, o + l);',
    '+}',
    'diff --git a/services/svc-academy/src/ambassadors/residency.ts b/services/svc-academy/src/ambassadors/residency.ts',
    '--- a/services/svc-academy/src/ambassadors/residency.ts',
    '+++ b/services/svc-academy/src/ambassadors/residency.ts',
    '@@ -658,0 +659,8 @@',
    '+  /** L3 — safe page of open ids with clamped bounds. */',
    '+  safePageOpenApplicationIds(offset: number, limit: number): readonly string[] {',
    '+    if (!Number.isFinite(offset) || !Number.isFinite(limit)) return [];',
    '+    const all = this.openApplicationIds();',
    '+    const o = Math.max(0, Math.min(all.length, Math.floor(offset)));',
    '+    const l = Math.max(0, Math.min(all.length - o, Math.floor(limit)));',
    '+    return all.slice(o, o + l);',
    '+  }',
    'diff --git a/services/svc-academy/src/http/routes.ts b/services/svc-academy/src/http/routes.ts',
    '--- a/services/svc-academy/src/http/routes.ts',
    '+++ b/services/svc-academy/src/http/routes.ts',
    '@@ -40,0 +41,2 @@',
    '+    this.reindex();',
    '+    reindex();',
    'diff --git a/services/svc-academy/src/curriculum/catalog.test.ts b/services/svc-academy/src/curriculum/catalog.test.ts',
    '--- a/services/svc-academy/src/curriculum/catalog.test.ts',
    '+++ b/services/svc-academy/src/curriculum/catalog.test.ts',
    '@@ -1,0 +2,2 @@',
    '+export function testOnlyHelper(): void {}',
    '+  itHelper(): void {}',
  ].join('\n');
  const syms = newNamedSymbols(diffFixture);
  const symNames = syms.map((s) => s.name);
  assert(symNames.includes('safePageCurriculumSlugs'), 'symbols: exported function collected');
  assert(symNames.includes('safePageOpenApplicationIds'), 'symbols: class method collected (the waves used both forms)');
  assert(!symNames.includes('testOnlyHelper') && !symNames.includes('itHelper'), 'symbols: test-file definitions are not collected');
  assert(!symNames.includes('reindex'), 'symbols: a bare call statement is not a declaration');
  fixture('newNamedSymbols — exports + class methods in, test-file defs and call statements out');

  // ── reachability ─────────────────────────────────────────────────────────
  const grep = [
    'services/svc-academy/src/curriculum/catalog.ts:1200:  return safePageCurriculumSlugs(0, 10);',
    'services/svc-academy/src/curriculum/catalog.test.ts:9:  expect(safePageCurriculumSlugs(0, 1)).toEqual([]);',
    "services/svc-academy/src/index.ts:4:export { safePageOpenApplicationIds } from './ambassadors/residency';",
  ];
  const reached0 = reachedSymbols(grep, syms);
  assert(reached0.length === 0, `reach: defining file + test file + barrel re-export reach nothing, got ${JSON.stringify(reached0)}`);
  const reached1 = reachedSymbols(
    [...grep, 'services/svc-academy/src/http/routes.ts:88:  const page = safePageCurriculumSlugs(offset, limit);'],
    syms,
  );
  assert(reached1.includes('safePageCurriculumSlugs'), 'reach: a real non-test caller outside the new-symbol files counts');
  const crossRef = reachedSymbols(['services/svc-academy/src/ambassadors/residency.ts:700:  return safePageCurriculumSlugs(0, 1);'], syms);
  assert(crossRef.length === 0, 'reach: one new-symbol file calling another is not reach — that dodge is closed');
  fixture('reachedSymbols — defining file, test file, barrel re-export and new-symbol cross-calls all excluded');

  // ── duplicate bodies (evidence only) ─────────────────────────────────────
  const clusters = duplicateBodyClusters(diffFixture);
  assert(
    clusters.length === 1 && clusters[0].length === 2,
    `dup bodies: the two real clamp bodies cluster, got ${JSON.stringify(clusters)}`,
  );
  const dupCarried = decide({
    files: waveFiles,
    subject: waveSubject,
    body: waveBody,
    prevSubjects: waveSubjects,
    newSymbols: waveSymbols,
    reached: ['parseCatalogStatusLine'],
    dupBodyClusters: 9,
  });
  assert(dupCarried.block === false, 'dup bodies: EVIDENCE ONLY — nine identical bodies must not block wired work');
  fixture('duplicateBodyClusters — identifier-normalised twins detected, and proven not to gate');

  // ── zero-walk ────────────────────────────────────────────────────────────
  assert(
    walkEvidence({ subject: 'feat: x', files: ['a.ts'], prevSubjects: ['b'], symbolWalkError: null }).length === 0,
    'zero-walk: a real evaluation has no reasons',
  );
  assert(
    walkEvidence({ subject: 'feat: x', files: ['a.ts'], prevSubjects: [], symbolWalkError: null }).length === 1,
    'zero-walk: empty ancestor list must FAIL (the fetch-depth:1 defect)',
  );
  assert(
    walkEvidence({ subject: 'feat: x', files: [], prevSubjects: ['b'], symbolWalkError: null }).length === 1,
    'zero-walk: empty diff must FAIL',
  );
  assert(
    walkEvidence({ subject: '', files: ['a.ts'], prevSubjects: ['b'], symbolWalkError: null }).length === 1,
    'zero-walk: missing subject must FAIL',
  );
  assert(
    walkEvidence({ subject: 'feat: x', files: ['a.ts'], prevSubjects: ['b'], symbolWalkError: 'git grep exited 128' }).length === 1,
    'zero-walk: broken reachability walk must FAIL, not pass',
  );
  assert(
    walkEvidence({ subject: '', files: [], prevSubjects: [], symbolWalkError: 'boom' }).length === 4,
    'zero-walk: every reason is reported, not just the first',
  );
  fixture('walkEvidence — no subject / no diff / no ancestors / broken symbol walk each FAIL LOUDLY');

  // no-op tree: merge result equals main tree → BLOCK (already landed / empty)
  //
  // `rev-parse` is stubbed per-ref rather than one blanket answer: the function
  // now resolves the base and head COMMITS as well as the base TREE, and a stub
  // that returns one value for all three makes every branch look like main.
  const mainTree = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const mainCommit = '1111111111111111111111111111111111111111';
  const headCommit = '2222222222222222222222222222222222222222';
  const revParse = (args) => {
    if (args[1] === 'main^{tree}') return { failed: false, stdout: mainTree };
    if (args[1] === 'main') return { failed: false, stdout: mainCommit };
    if (args[1] === 'HEAD') return { failed: false, stdout: headCommit };
    return { failed: true, stdout: '' };
  };
  assert(
    isNoOpOntoBase('main', 'HEAD', (args) => {
      if (args[0] === 'rev-parse') return revParse(args);
      if (args[0] === 'merge-tree') return { failed: false, stdout: mainTree + '\n' };
      return { failed: true, stdout: '' };
    }) === true,
    'no-op: equal trees must BLOCK',
  );
  fixture('no-op merge tree equals main → BLOCK');

  // real delta: merge-tree returns different tree → not no-op
  assert(
    isNoOpOntoBase('main', 'HEAD', (args) => {
      if (args[0] === 'rev-parse') return revParse(args);
      if (args[0] === 'merge-tree') return { failed: false, stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' };
      return { failed: true, stdout: '' };
    }) === false,
    'no-op: different trees must PASS',
  );

  // THE REGRESSION THIS FIXTURE EXISTS FOR: the workflow re-fires on the base
  // after a squash merge, so HEAD *is* main. Merging main into main yields
  // main's tree, which looked exactly like an empty branch and failed the run —
  // on every single merge. Identical commits must never be a no-op verdict.
  assert(
    isNoOpOntoBase('main', 'HEAD', (args) => {
      if (args[0] === 'rev-parse') {
        if (args[1] === 'main^{tree}') return { failed: false, stdout: mainTree };
        return { failed: false, stdout: mainCommit }; // main and HEAD are the same commit
      }
      if (args[0] === 'merge-tree') return { failed: false, stdout: mainTree + '\n' };
      return { failed: true, stdout: '' };
    }) === false,
    'no-op: a push ON the base is not a no-op branch',
  );
  fixture('push ON the base (HEAD === main) → PASS, not a no-op branch');

  // conflicts (merge-tree fails) → not a pure no-op (real work may still exist)
  assert(
    isNoOpOntoBase('main', 'HEAD', (args) => {
      if (args[0] === 'rev-parse') return { failed: false, stdout: mainTree };
      return { failed: true, stdout: '' };
    }) === false,
    'no-op: conflicts are not no-op',
  );

  if (fails.length) {
    console.error('value-gate --self-test FAIL:');
    for (const f of fails) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log(`value-gate --self-test OK (${names.length} fixtures)`);
  for (const n of names) console.log(`  fixture ${n}`);
  process.exit(0);
}

// ── live ────────────────────────────────────────────────────────────────────

function mainLive() {
  const { range, files } = resolveDiff(BASE);
  const headRef = resolveHeadRef();
  let subject = '';
  let body = '';
  try {
    subject = git(['log', '-1', '--pretty=%s', headRef]);
    body = git(['log', '-1', '--pretty=%B', headRef]);
  } catch {
    /* zero-walk will report it */
  }
  const prev = previousSubjects(headRef, 10);
  const walk = symbolWalk(range);
  const result = decide({
    files,
    subject,
    body,
    prevSubjects: prev,
    newSymbols: walk.symbols,
    reached: walk.reached,
    dupBodyClusters: walk.dupClusters,
  });

  const mode = STRICT ? 'strict' : 'advisory';
  const noOp = isNoOpOntoBase(BASE, 'HEAD');
  console.log(
    `value-gate: noOp=${noOp} docsOnly=${result.docsOnly} nearDup=${result.nearDup} (best=${result.best.toFixed(3)}) ` +
      `inSeries=${result.inSeries} (series=${result.seriesBest.toFixed(3)} hits=${result.seriesHits}/${result.blockRun}) ` +
      `newSymbols=${result.symbolCount} reached=${result.reachedCount} dupBodies=${result.dupBodyClusters} ` +
      `hasBoardDelta=${result.hasDelta} serialWork=${Boolean(result.serialWork)} mode=${mode}`,
  );
  console.log(`  subject: ${subject}${headRef === 'HEAD' ? '' : `   [read from ${headRef} — HEAD is a PR merge ref]`}`);
  console.log(`  range: ${range} · ancestors compared: ${prev.length}`);
  if (result.nearDup) console.log(`  similar to (norm): ${result.bestPrev.slice(0, 100)}`);
  if (result.nearDup && result.bestRaw) console.log(`  offending previous subject: ${result.bestRaw}`);
  if (result.inSeries && result.seriesRaw) console.log(`  series sibling: ${result.seriesRaw}`);
  if (result.serialWork) console.log(`  Serial-Work (audit): ${result.serialWork}`);
  console.log(`  files (${files.length}): ${files.slice(0, 8).join(', ')}${files.length > 8 ? '…' : ''}`);

  // ── zero-walk FIRST, after the no-op verdict. A definite verdict beats a
  // complaint about missing evidence; an EMPTY evaluation never prints clean.
  if (noOp) {
    const msg =
      `value-gate: ${STRICT ? 'FAIL' : 'WARN'} — branch adds nothing to ${BASE} (merge-tree equals main's tree).\n` +
      `  Already landed, empty squash, or superseded (e.g. re-landing a partner-merged head).\n` +
      `  Fix: delete the remote branch; do not open a PR. Pre-check:\n` +
      `    gh pr list --state merged --search \"head:<branch>\" --limit 5\n` +
      `    git merge-tree --write-tree origin/main origin/<branch>`;
    console.error(msg);
    if (STRICT) process.exit(1);
    process.exit(0);
  }

  const blind = walkEvidence({ subject, files, prevSubjects: prev, symbolWalkError: walk.error });
  if (blind.length) {
    console.error(
      `value-gate: FAIL — the gate evaluated NOTHING and will not report clean.\n` +
        blind.map((r) => `  · ${r}`).join('\n') +
        `\n  A gate that walks zero items and prints OK is the defect four gates in this repo exist to close.\n` +
        `  Fix: give the checkout history — 'actions/checkout@v4' defaults to fetch-depth: 1, this gate needs 0\n` +
        `  (base ref '${BASE}' and ≥11 ancestors). Locally: git fetch origin main.\n` +
        `  This exits 1 in advisory mode too: advisory softens a verdict, never the absence of one.`,
    );
    process.exit(1);
  }

  if (result.docsBlock) {
    const msg =
      `value-gate: ${STRICT ? 'FAIL' : 'WARN'} — docs-only near-duplicate with no Board-Delta trailer.\n` +
      `  Offending previous subject: ${result.bestRaw || result.bestPrev}\n` +
      `  Similarity: ${result.best.toFixed(3)} (threshold 0.80)\n` +
      `  This is the stamp-mill detector (S-CORE §3 / PROCESS-LOOPS L0) — not a banner.\n` +
      `  Fix: (1) add trailer "Board-Delta: <real change>" or (2) do not open a tip-bump PR.\n` +
      `  Valid Board-Delta: free product count | partner PR state | scan findings |\n` +
      `    Class N PR open/merge | substantive spec content. NOT tip SHA / cycle N / re-freeze.`;
    console.error(msg);
    if (STRICT) process.exit(1);
    process.exit(0);
  }

  if (result.stamp) {
    const verdict = result.codeBlock ? (STRICT ? 'FAIL' : 'WARN') : 'WARN';
    const msg =
      `value-gate: ${verdict} — near-duplicate subject #${result.seriesHits + 1} in a series, and nothing calls what it added.\n` +
      `  Series sibling: ${result.seriesRaw}\n` +
      `  Series similarity: ${result.seriesBest.toFixed(3)} (threshold 0.80) · near-identical ancestors in the last 10: ${result.seriesHits} (blocks at ${result.blockRun})\n` +
      `  New named symbols: ${result.symbolCount} · reached from a non-test file outside them: ${result.reachedCount}\n` +
      (result.dupBodyClusters
        ? `  Byte-identical bodies after identifier normalisation: ${result.dupBodyClusters} cluster(s) in this diff alone.\n`
        : '') +
      `  Similar titles are fine. Similar titles that add nothing anything calls are the same work counted twice.\n` +
      `  Fix, in order of preference:\n` +
      `    (1) wire it — one non-test caller outside the files you added symbols to clears this;\n` +
      `    (2) extract the shared shape instead of re-implementing it;\n` +
      `    (3) if the series is genuinely right, say so on the record:\n` +
      `          Serial-Work: <why this repeats — e.g. per-service rollout, one service per PR>\n` +
      `        It is a commit trailer, it is echoed in this log, and it is greppable:\n` +
      `          git log --grep '^Serial-Work:'\n` +
      (result.codeBlock
        ? `  BLOCKING: number ${result.seriesHits + 1} of this shape in the last 11 commits. The first ${result.blockRun} only warned.`
        : `  NOT blocking yet: ${result.seriesHits} of ${result.blockRun} in the window. The ${result.blockRun + 1}th of this shape is red.`);
    console.error(msg);
    if (result.codeBlock && STRICT) process.exit(1);
    process.exit(0);
  }

  console.log('value-gate: OK');
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  if (process.argv.includes('--self-test')) selfTest();
  else mainLive();
}
