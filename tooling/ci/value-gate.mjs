#!/usr/bin/env node
/**
 * value-gate — external stamp-mill detector (git-only, no gh, no network).
 *
 * Fails when ANY of:
 *   (0) no-op merge: git merge-tree of origin/main + HEAD equals main's tree
 *       (branch already landed / empty squash / superseded — #737 class defect)
 *   OR ALL of:
 *   (a) every changed file is under docs/ or ends with .md
 *   (b) normalised commit subject ≥0.80 similar to any of previous 10 ancestors
 *   (c) no Board-Delta: trailer in the commit body
 *
 * MUST wire in .github/workflows/docs-format.yml — not gates.mjs.
 * ci.yml paths-ignore docs/** so GATES never see coordinator PRs.
 *
 * Advisory (one cycle): VALUE_GATE_ADVISORY=1 → print, always exit 0 on block.
 * Strict: VALUE_GATE_STRICT=1 or --strict → exit 1 on block.
 * Default without flags: advisory (soft land).
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

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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

export function isDocsOnly(files) {
  if (!files.length) return false;
  return files.every((f) => f.startsWith('docs/') || f.endsWith('.md') || f === 'NOTICE' || f === 'LICENSE');
}

export function hasBoardDeltaTrailer(body) {
  return /^Board-Delta:\s*\S+/im.test(body || '');
}

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

/**
 * Pure decision — the thing CI enforces.
 */
export function decide({ files, subject, body, prevSubjects, threshold = 0.8 }) {
  const docsOnly = isDocsOnly(files);
  const norm = normalizeSubject(subject);
  const prev = (prevSubjects || []).map(normalizeSubject);
  let best = 0;
  let bestPrev = '';
  let bestRaw = '';
  for (let i = 0; i < prev.length; i++) {
    const s = similarity(norm, prev[i]);
    if (s > best) {
      best = s;
      bestPrev = prev[i];
      bestRaw = (prevSubjects || [])[i] || prev[i];
    }
  }
  const nearDup = best >= threshold;
  const hasDelta = hasBoardDeltaTrailer(body);
  const block = docsOnly && nearDup && !hasDelta;
  return { block, best, bestPrev, bestRaw, nearDup, docsOnly, hasDelta, norm };
}

function changedFiles(base) {
  let range = `${base}...HEAD`;
  try {
    git(['rev-parse', '--verify', base]);
  } catch {
    range = 'HEAD~1..HEAD';
  }
  try {
    const out = git(['diff', '--name-only', range]);
    if (out) return out.split('\n').filter(Boolean);
  } catch {
    /* empty */
  }
  try {
    const out = git(['diff', '--name-only', 'HEAD~1..HEAD']);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Last n subjects before HEAD (ancestry — sequential stamps on a branch + mill on main). */
function previousSubjects(n = 10) {
  try {
    const out = git(['log', 'HEAD', `-${n + 1}`, '--pretty=%s']);
    const lines = out ? out.split('\n').filter(Boolean) : [];
    return lines.slice(1);
  } catch {
    return [];
  }
}

function selfTest() {
  const fails = [];
  const assert = (cond, msg) => {
    if (!cond) fails.push(msg);
  };

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

  const withDelta = decide({
    files: ['docs/ops/R07-PEACE.md'],
    subject: stampB,
    body: `${stampB}\n\nBoard-Delta: partner PR #433 went red on Tests\n`,
    prevSubjects: stampPrev,
  });
  assert(withDelta.block === false, 'Board-Delta must clear the block');
  assert(withDelta.hasDelta === true, 'Board-Delta detected');

  const realCode = decide({
    files: ['services/svc-pay/src/index.ts', 'services/svc-pay/src/index.test.ts'],
    subject: 'feat(pay): M1 pay.gateway Done bar — card sandbox',
    body: 'feat(pay): M1 pay.gateway Done bar — card sandbox\n',
    prevSubjects: ['feat(pay): M1 pay.gateway Done bar — card sandbox prior'],
  });
  assert(realCode.docsOnly === false, 'code: not docsOnly');
  assert(realCode.block === false, 'code: must PASS');

  const realDocs = decide({
    files: ['docs/MONEY-BASELINE.md'],
    subject: 'docs: money baseline residual 10→0 after ledger recipes',
    body: 'docs: money baseline residual 10→0 after ledger recipes\n',
    prevSubjects: stampPrev,
  });
  assert(realDocs.docsOnly === true, 'real docs: docsOnly');
  assert(realDocs.nearDup === false, `real docs: not nearDup (sim=${realDocs.best.toFixed(3)})`);
  assert(realDocs.block === false, 'real docs: must PASS');

  assert(
    normalizeSubject('docs(ops): R07 cycle 99 tip abcdef1 (#711)') === normalizeSubject('docs(ops): R07 cycle 1 tip deadbeef (#1)'),
    'normalise: cycle/sha/pr collapse',
  );

  // no-op tree: merge result equals main tree → BLOCK (already landed / empty)
  const mainTree = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert(
    isNoOpOntoBase('main', 'HEAD', (args) => {
      if (args[0] === 'rev-parse') return { failed: false, stdout: mainTree };
      if (args[0] === 'merge-tree') return { failed: false, stdout: mainTree + '\n' };
      return { failed: true, stdout: '' };
    }) === true,
    'no-op: equal trees must BLOCK',
  );

  // real delta: merge-tree returns different tree → not no-op
  assert(
    isNoOpOntoBase('main', 'HEAD', (args) => {
      if (args[0] === 'rev-parse') return { failed: false, stdout: mainTree };
      if (args[0] === 'merge-tree') return { failed: false, stdout: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' };
      return { failed: true, stdout: '' };
    }) === false,
    'no-op: different trees must PASS',
  );

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
  console.log('value-gate --self-test OK (5 fixtures)');
  console.log('  fixture near-dup docs-only no Board-Delta → BLOCK (exit 1 path)');
  console.log('  fixture near-dup + Board-Delta → PASS');
  console.log('  fixture code change → PASS');
  console.log('  fixture unique docs title → PASS');
  console.log('  fixture no-op merge tree equals main → BLOCK');
  process.exit(0);
}

function mainLive() {
  const files = changedFiles(BASE);
  const subject = git(['log', '-1', '--pretty=%s']);
  const body = git(['log', '-1', '--pretty=%B']);
  const prev = previousSubjects(10);
  const result = decide({ files, subject, body, prevSubjects: prev });

  const mode = STRICT ? 'strict' : 'advisory';
  const noOp = isNoOpOntoBase(BASE, 'HEAD');
  console.log(
    `value-gate: noOp=${noOp} docsOnly=${result.docsOnly} nearDup=${result.nearDup} (best=${result.best.toFixed(3)}) hasBoardDelta=${result.hasDelta} mode=${mode}`,
  );
  console.log(`  subject: ${subject}`);
  if (result.nearDup) console.log(`  similar to (norm): ${result.bestPrev.slice(0, 100)}`);
  if (result.nearDup && result.bestRaw) console.log(`  offending previous subject: ${result.bestRaw}`);
  console.log(`  files (${files.length}): ${files.slice(0, 8).join(', ')}${files.length > 8 ? '…' : ''}`);

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

  if (result.block) {
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

  console.log('value-gate: OK');
  process.exit(0);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  if (process.argv.includes('--self-test')) selfTest();
  else mainLive();
}
