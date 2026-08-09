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
 *
 *   node tooling/scripts/worktree.mjs --self-test   start-point fixtures (no git, no I/O)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const command = process.argv[2];
const argument = process.argv[3];
const selfTest = process.argv.slice(2).includes('--self-test');

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

/**
 * The branch-name convention, as a value rather than a side effect, so
 * --self-test can assert it is still enforced. `docs-adr-foo` must be refused
 * in favour of `docs/adr-foo`: the prefix is what `wt:list`, `wt:gc` and the
 * claim board all key on, and a flattened name is a different branch that
 * merely looks like the right one.
 *
 * Returns null when the name is legal, or the operator-facing message when not.
 */
export function conventionError(branch) {
  if (!branch) return 'Usage: pnpm wt <branch-name>\n  e.g. pnpm wt feat/svc-identity-rank-events';
  if (/^(feat|fix|chore|docs|test|refactor)\//.test(branch)) return null;
  return (
    `Branch "${branch}" does not follow the naming convention.\n` +
    `  Use one of: feat/ fix/ chore/ docs/ test/ refactor/\n` +
    `  e.g. feat/${branch.replace(/^.*\//, '')}`
  );
}

// ─── the start point ────────────────────────────────────────────────────────
// Pure (git reads are injected) so that --self-test can assert on it without
// touching git or the disk.

/**
 * PIN THE START POINT TO A COMMIT, ONCE, AFTER THE FETCH.
 *
 * `git worktree add -b <branch> <path> origin/main` does not take a snapshot of
 * `origin/main` when we decide to use it — it resolves the NAME at the moment
 * of the add. Everything between the fetch and the add is a window in which the
 * ref can move: a concurrent `pnpm wt` in another lane, a `wt:gc` fetch, a
 * pre-commit hook, `gh pr checkout`. This trunk takes roughly 60 merges a day,
 * so the window is routinely non-empty.
 *
 * A 40-character object id cannot move. So the ref becomes a SHA here, exactly
 * once, and that one string is what the add is given, what the ancestry check
 * compares, and what the ✓ line reports. The three cannot disagree, and the
 * base the operator is told about is the base they got.
 *
 * `io` is { refExists, revParse, isAncestor } — every git read this needs.
 * Returns { ref, sha, warnings }: `ref` is the human name for the report only.
 */
export function planStartPoint({ base, branch, branchExists, fetchOk, io }) {
  const remote = `origin/${base}`;
  const hasRemote = io.refExists(remote);

  // An existing local branch is checked out as itself — `worktree add <path>
  // <branch>` — so the base is that branch's tip and the fetch above did not
  // move it. That is a legitimate resume, but it is NOT a fresh cut, and until
  // this function said so it was indistinguishable from one on stdout.
  const ref = branchExists ? branch : hasRemote ? remote : base;

  // THE ONE RESOLUTION. Adding a second read of `ref` anywhere below reopens
  // the race; --self-test counts the calls for exactly that reason.
  const sha = io.revParse(ref);

  const warnings = [];

  if (!fetchOk) {
    // The old code ran the fetch with stdio 'ignore' and never looked at the
    // status, so an offline laptop, an expired credential, or a lock held by a
    // concurrent worktree printed `· fetching main` and cut from whatever the
    // last successful fetch left behind — silently, and by hours-of-merges
    // rather than minutes.
    warnings.push({
      level: 'warn',
      code: 'FETCH_FAILED',
      text:
        `git fetch origin ${base} FAILED. ${remote} is only as fresh as the last successful fetch,\n` +
        `  so the base below may be far behind the real ${base}. Fix the fetch and re-cut, or accept it knowingly.`,
    });
  }

  if (hasRemote && ref !== remote) {
    // `origin/<base>` exists but is not what we are cutting from. Ask the
    // question that decides whether this is recoverable: is main CONTAINED in
    // the tip we are about to use?
    const contains = io.isAncestor(remote, sha);
    warnings.push(
      contains
        ? {
            level: 'note',
            code: 'RESUMED_BRANCH',
            text: `${branch} already exists locally — the worktree resumes its tip, it is not cut from ${remote}.`,
          }
        : {
            level: 'warn',
            code: 'BASE_NOT_DESCENDED_FROM_REMOTE',
            text:
              `${remote} is NOT an ancestor of ${branch}.\n` +
              `  This worktree starts from a base that ${base} has moved past, and \`git reset --hard ${remote}\`\n` +
              `  here would DISCARD commits rather than fast-forward. Rebase or merge deliberately.`,
          },
    );
  }

  return { ref, sha, warnings };
}

/**
 * The argv for the add. The last element in the fresh-branch case is the SHA —
 * never a ref name. That is the whole fix, in one assertable line.
 *
 * The resume case keeps `add <path> <branch>` with no start point on purpose:
 * handing it a SHA would check the branch out detached and lose the branch the
 * operator asked to resume.
 */
export function worktreeAddArgs({ path, branch, branchExists, sha }) {
  return branchExists ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, sha];
}

/** Every git read `planStartPoint` needs, against the real repo. */
const gitIo = {
  refExists,
  revParse: (ref) => git(['rev-parse', '--verify', `${ref}^{commit}`]),
  isAncestor: (ancestor, descendant) =>
    spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: REPO, stdio: 'ignore' }).status === 0,
};

function create(branch) {
  const bad = conventionError(branch);
  if (bad) fail(bad);

  mkdirSync(WORKTREE_ROOT, { recursive: true });
  const path = join(WORKTREE_ROOT, dirNameFor(branch));

  if (existsSync(path)) fail(`A worktree already exists at ${path}\n  cd "${path}"`);

  const base = baseBranch();

  // Always branch from the freshest base. A branch cut from a stale main is the
  // most common source of "works on my machine".
  console.log(`· fetching ${base}`);
  const fetched = spawnSync('git', ['fetch', 'origin', base], { cwd: REPO, stdio: 'ignore' });

  const branchExists = git(['branch', '--list', branch]) !== '';

  // Resolve ONCE, after the fetch — see planStartPoint.
  const plan = planStartPoint({ base, branch, branchExists, fetchOk: fetched.status === 0, io: gitIo });

  for (const w of plan.warnings) {
    if (w.level === 'warn') console.error(`\n⚠ ${w.text}\n`);
    else console.log(`· ${w.text}`);
  }

  console.log(`· creating worktree from ${plan.ref} ${plan.sha.slice(0, 8)}`);
  git(worktreeAddArgs({ path, branch, branchExists, sha: plan.sha }), { stdio: 'inherit' });

  // Post-condition, and the assertion the whole fix exists to make true: the
  // worktree is at the commit we pinned and are about to report. If a ref moved
  // under us anyway, the operator hears it now rather than 180 commits later.
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path, encoding: 'utf8' }).trim();
  if (head !== plan.sha) {
    console.error(
      `\n⚠ the new worktree is at ${head.slice(0, 8)} but the pinned base was ${plan.sha.slice(0, 8)}.\n` +
        `  Something moved the ref during the add. Check before you write code:\n` +
        `    git -C "${path}" log --oneline -1\n`,
    );
  }

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

  // REPORT THE BASE. A worktree cut 38 commits stale looks identical to a fresh
  // one, and on 2026-08-09 one was only caught because an agent had been told to
  // check by hand. The age is the tell: on a trunk taking ~60 merges a day, a
  // base whose newest commit is "5 hours ago" is a stale cut, said out loud on
  // the line the operator already reads.
  let when = '';
  try {
    when = git(['log', '-1', '--format=%cr', plan.sha]);
  } catch {
    /* a base with no log is not worth failing a create over */
  }
  console.log(`\n✓ ${branch}\n`);
  console.log(`  base  ${plan.sha.slice(0, 8)}  ${plan.ref}${when ? `  (${when})` : ''}\n`);
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
  // Same resolution `create` uses, so this command cannot answer a different
  // question from the one it is asked to preview.
  const plan = planStartPoint({ base, branch: null, branchExists: false, fetchOk: true, io: gitIo });
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const behind = git(['rev-list', '--count', `HEAD..${plan.sha}`]);
  console.log(`\n  new worktrees cut from  ${plan.ref} (${plan.sha.slice(0, 8)}, ${git(['log', '-1', '--format=%cr', plan.sha])})`);
  console.log(`  this checkout is on     ${head}, ${behind} commit(s) behind that\n`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// ─── self-test (revert-proofing) ─────────────────────────────────────────────
// Every assertion below is a claim this file makes in prose above, and each one
// names the revert it catches:
//
//   · pass a ref NAME to `worktree add` again  → "the add is given a SHA"
//   · resolve the ref a second time            → "resolved exactly once"
//   · drop the fetch status check              → "a failed fetch warns"
//   · drop the ancestry check                  → "a base that main is not an
//                                                 ancestor of warns"
//   · flatten the branch-name convention       → "docs-adr-foo is refused"
//   · re-resolve at the call site in create()  → "resolves … in exactly one
//                                                 place" + "hands the add the
//                                                 PLANNED sha"
//
// Pure fixtures: no git, no network, no disk. Runs before anything reads a repo.
if (selfTest) {
  const SHA_A = 'a'.repeat(40);
  const SHA_B = 'b'.repeat(40);

  /** A fake git whose `origin/main` MOVES on every read — the race, on demand. */
  function movingIo({ hasRemote = true, ancestor = true } = {}) {
    const shas = [SHA_A, SHA_B];
    const io = {
      calls: [],
      refExists: (ref) => (ref.startsWith('origin/') ? hasRemote : true),
      revParse: (ref) => {
        io.calls.push(ref);
        return shas[Math.min(io.calls.length - 1, shas.length - 1)];
      },
      isAncestor: () => ancestor,
    };
    return io;
  }

  const cases = [];
  const check = (name, got, want) => cases.push([name, got, want]);

  // ── the fix itself ────────────────────────────────────────────────────────
  {
    const io = movingIo();
    const plan = planStartPoint({ base: 'main', branch: 'feat/x', branchExists: false, fetchOk: true, io });
    const args = worktreeAddArgs({ path: 'C:/wt/feat-x', branch: 'feat/x', branchExists: false, sha: plan.sha });
    const start = args[args.length - 1];

    check('the add is given a SHA, not a ref name', /^[0-9a-f]{40}$/.test(start), true);
    check('the start point is never a ref name', start.includes('/'), false);
    check('the ref is resolved exactly once', io.calls.length, 1);
    check('the ref resolved is the remote base', io.calls[0], 'origin/main');
    // The ref moved between the plan and the add (movingIo returns SHA_B on a
    // second read). The add still gets the pinned SHA_A: a moving ref cannot
    // change a value already resolved.
    check('a ref that moves after the plan cannot change the add', start, SHA_A);
    check('the SHA reported is the SHA added', plan.sha, start);
    check('the report names the ref for humans', plan.ref, 'origin/main');
    check('a clean fresh cut warns about nothing', plan.warnings.length, 0);
  }

  // ── fetch failure is no longer swallowed ──────────────────────────────────
  {
    const plan = planStartPoint({ base: 'main', branch: 'feat/x', branchExists: false, fetchOk: false, io: movingIo() });
    check(
      'a failed fetch warns',
      plan.warnings.some((w) => w.level === 'warn' && w.code === 'FETCH_FAILED'),
      true,
    );
    check('a failed fetch still pins a SHA', plan.sha, SHA_A);
  }

  // ── resuming an existing local branch ─────────────────────────────────────
  {
    const io = movingIo({ ancestor: true });
    const plan = planStartPoint({ base: 'main', branch: 'feat/x', branchExists: true, fetchOk: true, io });
    const args = worktreeAddArgs({ path: 'C:/wt/feat-x', branch: 'feat/x', branchExists: true, sha: plan.sha });

    check('a resumed branch is cut from itself, not the remote', plan.ref, 'feat/x');
    check('a resumed branch is checked out as a branch, not detached at a SHA', args.join(' '), 'worktree add C:/wt/feat-x feat/x');
    check(
      'a resume says out loud that it is not a fresh cut',
      plan.warnings.some((w) => w.code === 'RESUMED_BRANCH'),
      true,
    );
    check(
      'a resume containing main is a note, not a warning',
      plan.warnings.every((w) => w.level === 'note'),
      true,
    );
  }
  {
    const plan = planStartPoint({ base: 'main', branch: 'feat/x', branchExists: true, fetchOk: true, io: movingIo({ ancestor: false }) });
    // The case where `git reset --hard origin/main` is NOT safe.
    check(
      'a base that main is not an ancestor of warns',
      plan.warnings.some((w) => w.level === 'warn' && w.code === 'BASE_NOT_DESCENDED_FROM_REMOTE'),
      true,
    );
    check(
      'that warning says a reset would discard commits',
      plan.warnings.some((w) => /DISCARD/.test(w.text)),
      true,
    );
  }

  // ── fresh clone with no remote-tracking ref ───────────────────────────────
  {
    const io = movingIo({ hasRemote: false });
    const plan = planStartPoint({ base: 'main', branch: 'feat/x', branchExists: false, fetchOk: true, io });
    check('with no origin ref the local base is used', plan.ref, 'main');
    check('with no origin ref the base is still pinned to a SHA', /^[0-9a-f]{40}$/.test(plan.sha), true);
    check('with no origin ref nothing claims an ancestry it cannot check', plan.warnings.length, 0);
  }

  // ── the naming convention stays strict ────────────────────────────────────
  check('docs-adr-foo is refused', conventionError('docs-adr-foo') !== null, true);
  check('docs/adr-foo is accepted', conventionError('docs/adr-foo'), null);
  check('fix/worktree-stale-base-race is accepted', conventionError('fix/worktree-stale-base-race'), null);
  check('a bare name is refused', conventionError('worktree-fix') !== null, true);
  check('an unknown prefix is refused', conventionError('wip/thing') !== null, true);
  check('no name at all is refused', conventionError('') !== null, true);

  // ── the wiring, which fixtures cannot see ─────────────────────────────────
  // Everything above tests `planStartPoint` and `worktreeAddArgs` in isolation.
  // A revert that leaves both correct and instead re-resolves the ref inside
  // `create()` — `sha: git(['rev-parse', 'origin/main'])` — would pass every
  // case above while restoring the race. So assert on this file's own text:
  // there is exactly ONE resolution in the whole script, and the add is handed
  // the planned SHA rather than a fresh one.
  //
  // Only the text ABOVE this self-test block counts. Searching the whole file
  // would let the needles below satisfy their own assertions — the first draft
  // of this check did exactly that, and a wiring revert passed 29/29.
  {
    const src = readFileSync(new URL(import.meta.url), 'utf8');
    // Split on a marker assembled at runtime, so this line is not itself a
    // second occurrence of the marker it searches for.
    const parts = src.split('// ─── self' + '-test');
    check('the self-test can find the code it is asserting about', parts.length, 2);
    const runtime = parts[0];
    // Case-insensitive, so `gitIo.revParse(` counts too.
    check('the script resolves a start point in exactly one place', (runtime.match(/revParse\(/gi) || []).length, 1);
    check('create() hands the add the PLANNED sha', runtime.includes('sha: plan' + '.sha'), true);
    check('create() asserts the new worktree HEAD equals the pinned base', runtime.includes('head !== plan' + '.sha'), true);
    check('the ✓ line reports the base', runtime.includes('base  ${plan' + '.sha.slice(0, 8)}'), true);
  }

  let failed = 0;
  console.log('worktree SELF-TEST\n');
  for (const [name, got, want] of cases) {
    const ok = Object.is(got, want);
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✖'} ${name.padEnd(64)} want=${String(want)} got=${String(got)}`);
  }
  console.log(
    failed ? `\n✖ ${failed}/${cases.length} self-test cases failed` : `\n✓ ${cases.length}/${cases.length} self-test cases passed`,
  );
  process.exit(failed ? 1 : 0);
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
