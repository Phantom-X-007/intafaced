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
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { touches } from '../scripts/path-collide.mjs';

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
  // Blank / whitespace-only argv used to count as "paths" and print ✓ clear
  // without checking anything real (exit 0). Same false-clear class as empty
  // no-args — strip them so the length===0 refuse below can fire.
  if (args.length > 0) {
    const files = args.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean);
    return { source: 'arguments', files };
  }

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

const { source, files: mine } = myFiles();

if (mine.length === 0) {
  // Exit 2 = cannot answer (same class as gh failure). Exit 0 used to look like
  // "lane free" when an agent forgot to pass paths — the soft false-clear that
  // ships agents into someone else's desk with a green checkmark. Blank /
  // whitespace-only argv used to take the same exit-0 path (#1252 residual).
  console.error('  claim-check — CANNOT ANSWER: no real paths given (empty args or clean branch).');
  console.error('      Pass the paths you are about to edit, e.g. `pnpm claim:check services/svc-bank`.');
  console.error('      Not reporting "clear" — this tool has not checked anything.');
  process.exit(2);
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

/**
 * HUMAN-CLAIMED MOUNTAINS — the question this tool did NOT answer, and should.
 *
 * On 2026-08-03 five agents were dispatched into features locked to a named
 * human. `claim:check` reported `✓ clear` for every one of them, and that is
 * what produced the confidence to dispatch.
 *
 * It was not wrong — it answered "is this file open in someone's PR right now",
 * which was all it was built to do. But an UNSTARTED human mountain has no open
 * PR by definition, so the emptier the lane, the greener the check. Exactly
 * backwards for the question people were actually asking it.
 *
 * Three of the five agents caught the lock themselves by reading
 * `tooling/tracker/features.mjs`. A tool that a careful reader has to
 * second-guess is worse than no tool, so it reads that file now.
 */
let ownershipError = null;

async function ownedPaths() {
  try {
    const mod = await import(pathToFileURL(join(process.cwd(), 'tooling/tracker/features.mjs')).href);
    const out = [];
    for (const f of mod.FEATURES ?? []) {
      if (!f.owner) continue;
      // `done` means the mountain already shipped. A leftover owner field is a
      // ghost, not a live human claim — fencing agents on it is a false block
      // (infra.ui-tokens + web.shell both sit done+owner:Nitro today).
      // ready/wip/socket with an owner still fence; only done is ignored.
      if (f.status === 'done') continue;

      // Declared paths, where a feature bothers to list them.
      const reqs = f.requires ?? [];
      for (const req of reqs) out.push({ path: req, owner: f.owner, id: f.id ?? '' });

      // Module fallback ONLY when the row names no paths. Rows that declare
      // `requires: ['services/svc-trade/src/futures']` must not also invent
      // `services/svc-trade` and whole-lock the service (W4 A0 / LANE-STOP-TRADE).
      // Empty-requires owners still need the fallback — that is how trade.otc /
      // bank.earn / pay.fraud were caught when agents were wrongly dispatched.
      //
      // `services/svc-<module>` is the convention throughout this repo.
      if (f.module && reqs.length === 0) {
        out.push({ path: `services/svc-${f.module}`, owner: f.owner, id: f.id ?? '' });
      }
    }
    return out;
  } catch (error) {
    // Cannot read = cannot claim clear on this axis. Surfaced, never swallowed:
    // a silent failure here reproduces the exact bug this check was added for.
    ownershipError = error.message;
    return null;
  }
}

const owned = await ownedPaths();
const lockHits = [];
if (owned === null) {
  console.error('  claim-check — CANNOT ANSWER: tracker ownership could not be read.');
  console.error(`      ${ownershipError}`);
  console.error('      The human-mountain check did NOT run. Not reporting clear.');
  process.exit(2);
} else {
  for (const o of owned) {
    if (mine.some((m) => touches(m, o.path))) {
      if (!lockHits.some((h) => h.path === o.path && h.owner === o.owner)) lockHits.push(o);
    }
  }
}

const self = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const collisions = [];

for (const pr of prs) {
  if (pr.headRefName === self) continue; // my own PR is not a collision
  const overlap = (pr.files ?? []).map((f) => f.path).filter((p) => mine.some((m) => touches(m, p)));
  if (overlap.length > 0) collisions.push({ pr, overlap });
}

console.log(`  claim-check — ${mine.length} path(s) from ${source}, against ${prs.length} open PR(s)\n`);

if (lockHits.length > 0) {
  console.error(`  ✖ ${lockHits.length} path(s) belong to a HUMAN-CLAIMED mountain:`);
  for (const h of lockHits) {
    console.error(`      ${h.path} — owner @${h.owner}${h.id ? ` (${h.id})` : ''}`);
  }
  console.error('');
  console.error('  An agent must NOT implement here. The documented unlock is the owner');
  console.error('  commenting `agents free on <path>`, or a PR moving the `owner` field in');
  console.error('  tooling/tracker/features.mjs and the ownership docs.');
  console.error('');
  console.error('  Reading it, babysitting CI, and reporting findings are all still fine.');
  process.exit(1);
}

if (collisions.length === 0) {
  console.log('  ✓ clear — no open PR touches these paths, and none is human-claimed');
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
