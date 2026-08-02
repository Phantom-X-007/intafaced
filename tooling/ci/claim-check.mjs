#!/usr/bin/env node
/**
 * CLAIM CHECK — is anyone already inside the files you are about to edit?
 *
 * WHY THIS EXISTS. `docs/LIVE-LANES.md` records who owns which MOUNTAIN. That
 * is the right granularity for deciding who builds Pay OS and who builds the
 * trader shell, and it is the wrong granularity for the thing that actually
 * costs us: two people editing the same file on the same afternoon.
 *
 * A concrete example, and the reason this file exists. An agent was dispatched
 * to migrate test isolation in `services/svc-pay`. Lane ownership said Pay was
 * a human mountain, which it read as "do not build pay FEATURES" — and test
 * infrastructure is not a feature, so it proceeded. Meanwhile PR #346 was open
 * and editing `services/svc-pay/src/payment-service.test.ts`: the exact file.
 *
 * Nobody was careless. The board answered the question it was designed to
 * answer. It simply does not carry the information "this file is open on
 * someone's desk right now", and no amount of reading it more carefully would
 * have produced that.
 *
 * The consequence would have been a merge race on test files that TRUNCATE
 * tables — which is the single worst place in this repo to have one, since the
 * losing side's rows vanish mid-assertion and it presents as flakiness.
 *
 * So: ask GitHub what is actually open, and compare it against what you are
 * about to touch. Ten seconds, no judgement required.
 *
 *   pnpm claim:check                      # what YOUR branch touches vs open PRs
 *   pnpm claim:check services/svc-bank    # before you start, by path
 *
 * Exit 0 = clear. Exit 1 = someone is in there; go and talk to them.
 *
 * This is ADVISORY, deliberately. It is not wired into `verify` and it does not
 * gate a merge. A tool that blocks people gets routed around; a tool that
 * answers a question honestly in ten seconds gets used. Overlap is often
 * completely fine — two people can edit one file with a word between them. The
 * failure mode we are removing is not overlap, it is *unknowing* overlap.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

/** `gh` returns JSON on stdout; anything else means we cannot answer honestly. */
function gh(jsonArgs) {
  try {
    return JSON.parse(execFileSync('gh', jsonArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    return { __error: error.stderr?.toString().trim() || error.message };
  }
}

function git(gitArgs) {
  try {
    return execFileSync('git', gitArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

/**
 * What am I about to touch?
 *
 * With paths given, those paths. Without, the files this branch changes versus
 * `origin/main` PLUS uncommitted work — because the most dangerous moment is
 * before the first commit, when nothing is pushed and nothing is visible to
 * anyone else at all.
 */
function myFiles() {
  if (args.length > 0) return { source: 'arguments', files: args };

  const base = git(['merge-base', 'origin/main', 'HEAD']) || 'origin/main';
  const committed = git(['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .filter(Boolean);
  const working = git(['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim());

  return { source: 'this branch (committed + working tree)', files: [...new Set([...committed, ...working])] };
}

/** A path claims another if either contains the other — `services/svc-bank` covers its files. */
const touches = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

const { source, files: mine } = myFiles();

if (mine.length === 0) {
  console.log('  claim-check — nothing to compare (no changes on this branch, no paths given)');
  process.exit(0);
}

const prs = gh(['pr', 'list', '--state', 'open', '--limit', '60', '--json', 'number,title,author,headRefName,files']);

if (prs.__error) {
  // Refuse rather than reassure. "No conflicts found" when we could not look is
  // the one output that would make this tool worse than not having it.
  console.error('  claim-check — CANNOT ANSWER: `gh` failed.');
  console.error(`      ${prs.__error}`);
  console.error('      Not reporting "clear" — this tool has not checked anything.');
  process.exit(2);
}

const self = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const collisions = [];

for (const pr of prs) {
  if (pr.headRefName === self) continue; // my own PR is not a collision
  const overlap = (pr.files ?? []).map((f) => f.path).filter((p) => mine.some((m) => touches(m, p)));
  if (overlap.length > 0) collisions.push({ pr, overlap });
}

console.log(`  claim-check — ${mine.length} path(s) from ${source}, against ${prs.length} open PR(s)\n`);

if (collisions.length === 0) {
  console.log('  ✓ clear — no open PR touches these paths');
  process.exit(0);
}

console.error(`  ✖ ${collisions.length} open PR(s) are already inside these paths:\n`);
for (const { pr, overlap } of collisions) {
  console.error(`      #${pr.number} @${pr.author.login} — ${pr.title}`);
  console.error(`          branch: ${pr.headRefName}`);
  for (const p of overlap.slice(0, 8)) console.error(`          · ${p}`);
  if (overlap.length > 8) console.error(`          · … and ${overlap.length - 8} more`);
  console.error('');
}

console.error('  Overlap is not automatically a problem — but it should be a conversation,');
console.error('  not a merge conflict discovered later. Talk to the author, or pick different work.');
process.exit(1);
