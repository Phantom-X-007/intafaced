#!/usr/bin/env node
/**
 * SYNC — pull Nitro's merges and rebase every live spine branch onto them.
 *
 * Two people and a dozen agents ship into one `main`. A branch cut an hour ago
 * is already behind, and the cost is not the rebase — it is finding out at merge
 * time, on the branch that matters, when you are trying to land something
 * urgent. Today one branch drifted seven commits behind and conflicted; the
 * other six were clean, and the only way to know which was which was to ask.
 *
 * This asks. Run it before starting work, after any long agent wave, and before
 * opening a PR:
 *
 *   node tooling/scripts/sync-branches.mjs            # report only
 *   node tooling/scripts/sync-branches.mjs --rebase   # also rebase what is clean
 *
 * `--rebase` deliberately only touches branches that rebase WITHOUT conflict,
 * and only when their worktree is clean. A conflicted rebase needs a human
 * deciding which side is right, and a dirty worktree usually means an agent is
 * mid-task — this must never be the thing that loses their work.
 */
import { execFileSync } from 'node:child_process';

const REBASE = process.argv.includes('--rebase');

const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return { failed: true, message: String(err.stderr ?? err.message ?? err).trim() };
  }
};

const ok = (r) => typeof r === 'string';

console.log('Fetching origin…');
git(['fetch', 'origin', '--prune']);

const mainTip = git(['rev-parse', '--short', 'origin/main']);
const mainSubject = git(['log', '-1', '--format=%s', 'origin/main']);
console.log(`origin/main  ${mainTip}  ${mainSubject}\n`);

/** Every worktree, with the branch it holds. */
const worktrees = git(['worktree', 'list', '--porcelain'])
  .split('\n\n')
  .map((block) => {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    return path && branch ? { path, branch } : null;
  })
  .filter(Boolean)
  .filter((w) => w.branch !== 'main');

if (worktrees.length === 0) {
  console.log('No branch worktrees besides main.');
  process.exit(0);
}

const rows = [];
for (const { path, branch } of worktrees) {
  const ahead = git(['rev-list', '--count', `origin/main..${branch}`], path);
  const behind = git(['rev-list', '--count', `${branch}..origin/main`], path);
  const dirty = git(['status', '--porcelain'], path);
  if (!ok(ahead) || !ok(behind) || !ok(dirty)) {
    rows.push({ branch, state: 'unreadable', ahead: '?', behind: '?', path });
    continue;
  }

  // Does it rebase cleanly? merge-tree answers without touching the worktree.
  const probe = git(['merge-tree', '--write-tree', 'origin/main', branch]);
  const conflicts = !ok(probe);

  const dirtyCount = dirty ? dirty.split('\n').length : 0;
  let state;
  if (conflicts) state = 'CONFLICT';
  else if (Number(behind) === 0) state = 'current';
  else state = 'behind';

  rows.push({ branch, state, ahead, behind, dirty: dirtyCount, path });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('BRANCH', 40)} ${pad('AHEAD', 6)} ${pad('BEHIND', 7)} ${pad('DIRTY', 6)} STATE`);
for (const r of rows.sort((a, b) => a.branch.localeCompare(b.branch))) {
  console.log(`${pad(r.branch, 40)} ${pad(r.ahead, 6)} ${pad(r.behind, 7)} ${pad(r.dirty ?? '-', 6)} ${r.state}`);
}

if (!REBASE) {
  const stale = rows.filter((r) => r.state === 'behind' || r.state === 'CONFLICT');
  console.log(
    stale.length
      ? `\n${stale.length} branch(es) not current. Re-run with --rebase to update the clean ones.`
      : '\nEvery branch is current with origin/main.',
  );
  process.exit(0);
}

console.log('\nRebasing…');
for (const r of rows) {
  if (r.state === 'current') continue;

  if (r.state === 'CONFLICT') {
    console.log(`  ${r.branch}: SKIPPED — conflicts. A human decides which side is right.`);
    continue;
  }
  if (r.dirty > 0) {
    // An agent is probably mid-task in here. Losing that costs far more than
    // being a few commits behind.
    console.log(`  ${r.branch}: SKIPPED — ${r.dirty} uncommitted file(s); commit or stash first.`);
    continue;
  }

  const res = git(['rebase', 'origin/main'], r.path);
  if (ok(res)) {
    console.log(`  ${r.branch}: rebased onto ${mainTip}`);
  } else {
    git(['rebase', '--abort'], r.path);
    console.log(`  ${r.branch}: FAILED, aborted cleanly — ${res.message.split('\n')[0]}`);
  }
}

console.log('\nRebased branches need `git push --force-with-lease`, and re-verifying before you trust them.');
