#!/usr/bin/env node
/**
 * Catch up git-seed graph.json when it is >50 commits behind origin/main.
 * Commits only graph.json + manifest.json on chore/graphify-catchup-*.
 * Single-flight. 6h throttle. Fail-open. Do not wait for CI.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
const LOCK = join(homedir(), '.grok/graphify-hooks/catchup.lock');
const TITLE = 'chore(tooling): graphify map catch-up';
const env = {
  ...process.env,
  PATH: `${homedir()}/.local/bin:/opt/homebrew/bin:${process.env.PATH || ''}`,
  GRAPHIFY_MAX_WORKERS: process.env.GRAPHIFY_MAX_WORKERS || '1',
};

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, env, ...opts });
}

function behind() {
  const graphPath = join(ROOT, 'graphify-out/graph.json');
  if (!existsSync(graphPath)) return 0;
  let built = '';
  try {
    built = JSON.parse(readFileSync(graphPath, 'utf8')).built_at_commit || '';
  } catch {
    return 0;
  }
  if (!built) return 0;
  sh('git', ['fetch', 'origin', 'main', '--prune']);
  const n = Number(sh('git', ['rev-list', '--count', `${built}..origin/main`]).stdout.trim());
  return Number.isFinite(n) ? n : 0;
}

function throttleOk() {
  try {
    mkdirSync(join(homedir(), '.grok/graphify-hooks'), { recursive: true });
    if (existsSync(LOCK)) {
      const age = Date.now() - Number(readFileSync(LOCK, 'utf8'));
      if (Number.isFinite(age) && age < 6 * 3600 * 1000) {
        console.log('graphify-catchup: throttled (<6h)');
        return false;
      }
    }
    writeFileSync(LOCK, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

function openCatchupPr() {
  const out = sh('gh', [
    'pr',
    'list',
    '--repo',
    'Phantom-X-007/intafaced',
    '--state',
    'open',
    '--search',
    TITLE,
    '--json',
    'number,title,updatedAt,url',
  ]);
  if (out.status !== 0) return [];
  try {
    return JSON.parse(out.stdout || '[]').filter((p) => p.title === TITLE);
  } catch {
    return [];
  }
}

const n = behind();
if (n <= 50) {
  console.log(`graphify-catchup: ${n} behind (ok)`);
  process.exit(0);
}
if (!throttleOk()) process.exit(0);

const open = openCatchupPr();
if (open.length) {
  const updated = Date.parse(open[0].updatedAt);
  const idleH = (Date.now() - updated) / 3600000;
  if (idleH > 24) {
    console.log(`graphify-catchup: closing idle PR #${open[0].number}`);
    sh('gh', ['pr', 'close', String(open[0].number), '--comment', 'stale catch-up; retrying']);
  } else {
    console.log(`graphify-catchup: in flight ${open[0].url}`);
    process.exit(0);
  }
}

const day = new Date().toISOString().slice(0, 10);
const branch = `chore/graphify-catchup-${day}`;
const wt = sh('pnpm', ['wt', branch], { stdio: 'inherit' });
if (wt.status !== 0) {
  console.error('graphify-catchup: pnpm wt failed (fail-open)');
  process.exit(0);
}

const tree = join(homedir(), 'projects/sovereign-worktrees', branch.replace(/\//g, '-'));
const cwd = existsSync(tree) ? tree : ROOT;
const upd = spawnSync('graphify', ['update', '.'], {
  cwd,
  encoding: 'utf8',
  env,
  timeout: 600000,
  stdio: 'inherit',
});
if (upd.status !== 0) {
  console.error('graphify-catchup: graphify update failed (fail-open)');
  process.exit(0);
}

const add = spawnSync('git', ['add', 'graphify-out/graph.json', 'graphify-out/manifest.json'], {
  cwd,
  encoding: 'utf8',
});
const st = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' });
if (!st.stdout.trim()) {
  console.log('graphify-catchup: no map delta');
  process.exit(0);
}
const commit = spawnSync('git', ['commit', '-m', `${TITLE}\n\nAST-only. graph.json + manifest.json. No product files.`], {
  cwd,
  encoding: 'utf8',
  env,
});
if (commit.status !== 0) {
  console.error(commit.stderr || commit.stdout);
  process.exit(0);
}
spawnSync('git', ['push', '-u', 'origin', `HEAD:refs/heads/${branch}`], { cwd, encoding: 'utf8', stdio: 'inherit' });
const pr = spawnSync(
  'gh',
  [
    'pr',
    'create',
    '--repo',
    'Phantom-X-007/intafaced',
    '--title',
    TITLE,
    '--body',
    'Git seed map catch-up. AST only. `graph.json` + `manifest.json`. Merge without waiting CI.',
  ],
  { cwd, encoding: 'utf8' },
);
console.log(pr.stdout || pr.stderr);
if (pr.status === 0) {
  spawnSync('gh', ['pr', 'merge', '--squash', '--delete-branch'], { cwd, encoding: 'utf8', stdio: 'inherit' });
}
try {
  unlinkSync(LOCK);
} catch {
  /* keep throttle if merge is slow */
}
