#!/usr/bin/env node
/**
 * Worktree manager.
 *
 * CONTRIBUTING.md §2: nobody works in the main checkout — not the two of us, and
 * not any AI agent. With several agents running at once, a shared working
 * directory is where afternoons go to die: two agents edit the same files, a
 * stash swallows something, and nobody can reconstruct what happened.
 *
 * A worktree per branch makes that structurally impossible.
 *
 *   pnpm wt feat/svc-identity-rank    create + install + report the path
 *   pnpm wt:list                      what exists, and how stale
 *   pnpm wt:rm feat/svc-identity-rank remove worktree and local branch
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const command = process.argv[2];
const argument = process.argv[3];

const REPO = process.cwd();
const WORKTREE_ROOT = resolve(REPO, '..', `${basename(REPO).toLowerCase().replace(/\s+/g, '-')}-worktrees`);

function git(args, options = {}) {
  const out = execFileSync('git', args, { encoding: 'utf8', cwd: REPO, ...options });
  // execFileSync returns null when stdout is not piped (e.g. stdio: 'inherit').
  return typeof out === 'string' ? out.trim() : '';
}

/** True when a ref resolves. Never throws — a missing ref is an answer, not an error. */
function refExists(ref) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: REPO, stdio: 'ignore' }).status === 0;
}

/** feat/svc-identity-rank → feat-svc-identity-rank (a legal directory name). */
function dirNameFor(branch) {
  return branch.replace(/[/\\:]/g, '-');
}

function inMainCheckout() {
  try {
    return git(['rev-parse', '--git-dir']) === '.git';
  } catch {
    return false;
  }
}

function baseBranch() {
  // THE REMOTE IS THE AUTHORITY, and it is asked FIRST.
  //
  // This used to look only for a LOCAL `main`, and fall through to "whatever
  // HEAD is on" when it found none. That fallback reads as a fresh-clone
  // safety net; on the machine this repo is actually driven from it is the
  // normal case, because a checkout that only ever works in worktrees never
  // creates a local `main` at all. `git branch --list main` returns nothing,
  // and the start point silently becomes the stale topic branch the main
  // checkout happens to be parked on.
  //
  // Measured on 2026-08-08: the main checkout sat on a docs branch while
  // `origin/main` was 8 hours and ~300 merges ahead. Every worktree cut that
  // day started from the docs branch — so agents re-found bugs that were
  // already fixed on main, wrote patches against files that had since been
  // rewritten, and only discovered it at rebase. `create()` below already
  // fetches this branch and prefers `origin/<base>` as the start point, which
  // is the intent this function was failing to feed.
  if (refExists('origin/main')) return 'main';
  if (refExists('origin/master')) return 'master';
  const branches = git(['branch', '--list', 'main', 'master']);
  if (branches.includes('main')) return 'main';
  if (branches.includes('master')) return 'master';
  return git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

function create(branch) {
  if (!branch) fail('Usage: pnpm wt <branch-name>\n  e.g. pnpm wt feat/svc-identity-rank-events');

  if (!/^(feat|fix|chore|docs|test|refactor)\//.test(branch)) {
    fail(
      `Branch "${branch}" does not follow the naming convention.\n` +
        `  Use one of: feat/ fix/ chore/ docs/ test/ refactor/\n` +
        `  e.g. feat/${branch.replace(/^.*\//, '')}`,
    );
  }

  mkdirSync(WORKTREE_ROOT, { recursive: true });
  const path = join(WORKTREE_ROOT, dirNameFor(branch));

  if (existsSync(path)) fail(`A worktree already exists at ${path}\n  cd "${path}"`);

  const base = baseBranch();

  // Always branch from the freshest base. A branch cut from a stale main is the
  // most common source of "works on my machine".
  console.log(`· fetching ${base}`);
  spawnSync('git', ['fetch', 'origin', base], { cwd: REPO, stdio: 'ignore' });

  const startPoint = refExists(`origin/${base}`) ? `origin/${base}` : base;

  const branchExists = git(['branch', '--list', branch]) !== '';
  console.log(`· creating worktree from ${startPoint}`);
  git(branchExists ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, startPoint], {
    stdio: 'inherit',
  });

  // Each worktree needs its own node_modules — the dev server, tsserver, and
  // vitest all resolve from it. pnpm hardlinks from the global store, so ten
  // worktrees cost about one worktree of disk.
  console.log('· pnpm install');
  const install = spawnSync('pnpm', ['install'], { cwd: path, stdio: 'inherit', shell: true });
  if (install.status !== 0) {
    console.error('\n⚠ install failed — the worktree exists, run pnpm install in it yourself');
  }

  // .env is gitignored, so a new worktree has none. Copy it across rather than
  // letting the first command fail on a missing variable.
  const env = join(REPO, '.env');
  if (existsSync(env) && !existsSync(join(path, '.env'))) {
    execFileSync(process.execPath, ['-e', `require('fs').copyFileSync(${JSON.stringify(env)}, ${JSON.stringify(join(path, '.env'))})`]);
    console.log('· copied .env');
  }

  console.log(`\n✓ ${branch}\n`);
  console.log(`  cd "${path}"\n`);
  console.log('  Open your editor AND any AI agent in that directory — not here.');
}

function list() {
  const raw = git(['worktree', 'list', '--porcelain']);
  const entries = [];
  let current = {};

  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) current = { path: line.slice(9) };
    else if (line.startsWith('branch ')) current.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === '') {
      if (current.path) entries.push(current);
      current = {};
    }
  }
  if (current.path) entries.push(current);

  console.log('\nWorktrees\n');
  for (const entry of entries) {
    const isMain = resolve(entry.path) === resolve(REPO);
    const label = isMain ? '(main checkout — do not work here)' : '';

    let staleness = '';
    if (!isMain && entry.branch) {
      try {
        const behind = git(['rev-list', '--count', `${entry.branch}..${baseBranch()}`]);
        if (Number(behind) > 0) staleness = `  ${behind} commit(s) behind ${baseBranch()}`;
      } catch {
        /* branch may not have a base yet */
      }
    }

    console.log(`  ${(entry.branch ?? 'detached').padEnd(42)} ${entry.path}`);
    if (label) console.log(`  ${''.padEnd(42)} ${label}`);
    if (staleness) console.log(`  ${''.padEnd(42)}${staleness}`);
  }
  console.log('');
}

function remove(branch) {
  if (!branch) fail('Usage: pnpm wt:rm <branch-name>');

  const path = join(WORKTREE_ROOT, dirNameFor(branch));
  if (!existsSync(path)) fail(`No worktree at ${path}`);

  // Refuse to discard work. If the branch has uncommitted changes or unmerged
  // commits, say so and stop — this script must never be how work is lost.
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: path, encoding: 'utf8' }).trim();
  if (dirty) {
    fail(`${branch} has uncommitted changes:\n${dirty}\n\nCommit or discard them first, then re-run.`);
  }

  console.log(`· removing worktree ${path}`);
  git(['worktree', 'remove', path], { stdio: 'inherit' });

  const merged = git(['branch', '--merged', baseBranch()]).includes(branch);
  if (merged) {
    git(['branch', '-d', branch], { stdio: 'inherit' });
    console.log(`✓ removed worktree and merged branch ${branch}`);
  } else {
    console.log(`✓ removed worktree`);
    console.log(`  Branch "${branch}" kept — it is not merged into ${baseBranch()}.`);
    console.log(`  Delete it with: git branch -D ${branch}`);
  }
}

/** The start point `create` resolves, plus how far HEAD is from it. */
function printBase() {
  const base = baseBranch();
  const startPoint = refExists(`origin/${base}`) ? `origin/${base}` : base;
  const sha = git(['rev-parse', '--short', startPoint]);
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const behind = git(['rev-list', '--count', `HEAD..${startPoint}`]);
  console.log(`\n  new worktrees cut from  ${startPoint} (${sha})`);
  console.log(`  this checkout is on     ${head}, ${behind} commit(s) behind that\n`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!inMainCheckout() && command !== 'list') {
  console.error('\n⚠ Run worktree commands from the MAIN CHECKOUT, not from inside a worktree.\n');
}

switch (command) {
  case 'create':
    create(argument);
    break;
  case 'base':
    // What `create` would cut from, without cutting anything. One command, so
    // "am I about to branch from a stale base" is answerable before the fact
    // rather than at the first rebase.
    printBase();
    break;
  case 'list':
    list();
    break;
  case 'remove':
    remove(argument);
    break;
  default:
    console.log(`
Worktree manager — CONTRIBUTING.md §2

  pnpm wt <branch>       create a worktree (+ install, + .env)
  pnpm wt:base           what a new worktree would be cut from, and how stale this checkout is
  pnpm wt:list           list worktrees and how stale they are
  pnpm wt:rm <branch>    remove a worktree (refuses if work is uncommitted)

Worktrees live in ${WORKTREE_ROOT}
`);
}
