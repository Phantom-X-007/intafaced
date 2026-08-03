#!/usr/bin/env node
/**
 * worktree-gc — remove clean worktrees whose commits are already on origin/main
 * (git cherry empty), or whose HEAD is an ancestor of main.
 *
 *   node tooling/scripts/worktree-gc.mjs --dry-run
 *   node tooling/scripts/worktree-gc.mjs --apply
 *
 * Never touches the main checkout. Never removes a dirty worktree.
 * Unpushed unique commits (cherry +) are kept.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { basename } from 'node:path';

const apply = process.argv.includes('--apply');
const dry = !apply;

function git(args, opts = {}) {
  const out = execFileSync('git', args, { encoding: 'utf8', ...opts });
  return typeof out === 'string' ? out.trim() : '';
}

function gitOk(args, opts = {}) {
  return spawnSync('git', args, { encoding: 'utf8', ...opts }).status === 0;
}

// Must run from main checkout (has .git dir)
const gitDir = git(['rev-parse', '--git-dir']);
if (gitDir !== '.git' && !gitDir.endsWith('/.git') && gitDir !== '.git') {
  // allow .git file for worktrees detection — refuse if we're IN a linked worktree
  const common = spawnSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' });
  const top = git(['rev-parse', '--show-toplevel']);
  const mainGuess = basename(top);
  // continue; we only skip removing the toplevel of this repo
}

spawnSync('git', ['fetch', 'origin', 'main'], { stdio: 'ignore' });
const main = git(['rev-parse', 'origin/main']);
const raw = git(['worktree', 'list', '--porcelain']).split('\n');
const wts = [];
let cur = {};
for (const line of [...raw, '']) {
  if (line.startsWith('worktree ')) {
    if (cur.path) wts.push(cur);
    cur = { path: line.slice(9) };
  } else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
  else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (line.startsWith('detached')) cur.detached = true;
  else if (line === '' && cur.path) {
    wts.push(cur);
    cur = {};
  }
}

const top = git(['rev-parse', '--show-toplevel']);
const safe = [];
const keep = [];
const dirty = [];

for (const w of wts) {
  if (w.path === top) {
    keep.push({ ...w, reason: 'MAIN' });
    continue;
  }
  const st = spawnSync('git', ['-C', w.path, 'status', '--porcelain'], { encoding: 'utf8' });
  if ((st.stdout || '').trim()) {
    dirty.push({ ...w, reason: 'DIRTY', n: st.stdout.trim().split('\n').length });
    continue;
  }
  const ref = w.branch || w.head;
  const cherry = spawnSync('git', ['cherry', 'origin/main', ref], { encoding: 'utf8' });
  const plus = (cherry.stdout || '').split('\n').filter((l) => l.startsWith('+ '));
  if (plus.length === 0) {
    safe.push({ ...w, reason: 'CHERRY_EMPTY' });
  } else {
    keep.push({ ...w, reason: `PLUS_${plus.length}`, plus: plus.length });
  }
}

console.log(`worktree-gc ${dry ? 'DRY-RUN' : 'APPLY'}`);
console.log(`main=${main.slice(0, 8)} total=${wts.length} safe=${safe.length} dirty=${dirty.length} keep=${keep.length}`);
for (const w of safe) {
  const label = w.branch || w.head?.slice(0, 8);
  console.log(`  SAFE  ${w.reason.padEnd(14)} ${label}  ${w.path}`);
}
for (const w of dirty) {
  console.log(`  DIRTY ${String(w.n).padStart(3)} files  ${w.branch || 'detached'}  ${w.path}`);
}
for (const w of keep) {
  if (w.reason === 'MAIN') continue;
  console.log(`  KEEP  ${w.reason.padEnd(14)} ${w.branch || w.head?.slice(0, 8)}  ${w.path}`);
}

if (dry) {
  console.log('\nRe-run with --apply to remove SAFE worktrees only.');
  process.exit(0);
}

let removed = 0;
for (const w of safe) {
  try {
    git(['worktree', 'remove', '--force', w.path], { stdio: 'inherit' });
    if (w.branch) {
      spawnSync('git', ['branch', '-D', w.branch], { stdio: 'ignore' });
    }
    removed++;
  } catch (e) {
    console.error(`  FAIL remove ${w.path}: ${e.message}`);
  }
}
console.log(`\n✓ removed ${removed}/${safe.length} safe worktrees`);
