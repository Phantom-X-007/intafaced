#!/usr/bin/env node
/**
 * value-gate — external stamp-mill detector (git-only, no gh).
 *
 * Fails (or warns) a PR when ALL of:
 *   (a) every changed file is under docs/ or ends with .md
 *   (b) normalised commit subject ≥0.80 similar to any of previous 10 on main
 *   (c) no Board-Delta: trailer in the commit body
 *
 * Wire: .github/workflows/docs-format.yml (NOT gates.mjs — ci.yml paths-ignore docs).
 * START ADVISORY: VALUE_GATE_STRICT=1 to exit 1; default exit 0 with WARN.
 *
 * Board-Delta trailer (git convention): Board-Delta: <what changed>
 * Valid deltas: free product count | partner PR state | scan findings |
 *   Class N PR open/merge | substantive spec content
 * NOT valid: tip SHA, cycle N, "re-freeze ran"
 *
 * Law homes: docs/ops/SWARM-MANDATE.md · docs/BOARD-CLEAR-PROCESS-LOOPS.md L0
 */
import { execFileSync } from 'node:child_process';

const STRICT = process.env.VALUE_GATE_STRICT === '1' || process.argv.includes('--strict');
const BASE = process.env.VALUE_GATE_BASE || 'origin/main';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function normalizeSubject(s) {
  return s
    .replace(/\(#[0-9]+\)/g, '')
    .replace(/\b[0-9a-f]{7,40}\b/gi, '')
    .replace(/\bcycle\s*\d+\b/gi, 'cycle N')
    .replace(/\d+/g, 'N')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient on bigrams — good for short titles without deps. */
function similarity(a, b) {
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

function changedFiles(base) {
  // merge-base range for PR; fall back to HEAD~1
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

function isDocsOnly(files) {
  if (!files.length) return false;
  return files.every((f) => f.startsWith('docs/') || f.endsWith('.md') || f === 'NOTICE' || f === 'LICENSE');
}

function hasBoardDeltaTrailer(body) {
  return /^Board-Delta:\s*\S+/im.test(body || '');
}

function previousSubjects(base, n = 10) {
  try {
    const out = git(['log', base, `-${n}`, '--pretty=%s']);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

// --- main ---
const files = changedFiles(BASE);
const docsOnly = isDocsOnly(files);
const subject = git(['log', '-1', '--pretty=%s']);
const body = git(['log', '-1', '--pretty=%B']);
const norm = normalizeSubject(subject);
const prev = previousSubjects(BASE, 10).map(normalizeSubject);
let best = 0;
let bestSubj = '';
for (const p of prev) {
  const s = similarity(norm, p);
  if (s > best) {
    best = s;
    bestSubj = p;
  }
}
const nearDup = best >= 0.8;
const hasDelta = hasBoardDeltaTrailer(body);

const block = docsOnly && nearDup && !hasDelta;

console.log(`value-gate: docsOnly=${docsOnly} nearDup=${nearDup} (best=${best.toFixed(3)}) hasBoardDelta=${hasDelta} strict=${STRICT}`);
console.log(`  subject: ${subject}`);
if (nearDup) console.log(`  similar to: ${bestSubj.slice(0, 80)}`);
console.log(`  files (${files.length}): ${files.slice(0, 8).join(', ')}${files.length > 8 ? '…' : ''}`);

if (block) {
  const msg =
    `value-gate: ${STRICT ? 'FAIL' : 'WARN'} — docs-only near-duplicate with no Board-Delta trailer.\n` +
    `  This is the stamp-mill detector (S-CORE §3 / PROCESS-LOOPS L0).\n` +
    `  Fix: either (1) add trailer "Board-Delta: <real change>" with a valid reason, or\n` +
    `       (2) do not open a tip-bump/cycle PR when the board is unchanged.\n` +
    `  Valid Board-Delta: free product count | partner PR state | scan findings |\n` +
    `    Class N PR open/merge | substantive spec content. NOT tip SHA / cycle N / re-freeze.`;
  console.error(msg);
  if (STRICT) process.exit(1);
  process.exit(0);
}

console.log('value-gate: OK');
process.exit(0);
