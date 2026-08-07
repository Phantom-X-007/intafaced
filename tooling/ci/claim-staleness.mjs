#!/usr/bin/env node
/**
 * CLAIM STALENESS — the lock outlived the session that took it.
 *
 * A `TRK-*` claim whose status is `claimed`, `pr-open` or `wip` HIDES that
 * mountain from the free board (`claimLockHidesFree` in tooling/scripts/swarm.mjs).
 * That is correct while somebody is holding it. It is a lie the moment the work
 * merges and the session ends without writing the claim back — and an agent
 * session ending abruptly is the normal case, not the exception.
 *
 * MEASURED, 2026-08-07: sixteen slices merged in one day and not one claim was
 * closed. Twelve tracker mountains were hidden from the free board by sessions
 * that no longer existed.
 *
 * That number matters because of what the board does with it. SWARM-MANDATE
 * reads `freeProduct = 0` as "do not idle — mint Stage-N slices", so a board
 * emptied by stale locks does not stall, it manufactures. This repo has already
 * paid for that once from the opposite direction: `merged` used to close a
 * tracker row permanently, six live features went invisible, the swarm minted
 * catalog modules instead, and 151 of them were deleted as unreachable in #953.
 * Same empty board, same make-work, different cause.
 *
 * WHY THIS ONLY REPORTS.
 *
 * It cannot know that a claim is dead — only that its work appears to have
 * landed, which is also what a claim looks like one minute before its owner
 * writes it back. A gate that reddens main on that guess would block the very
 * sessions it is meant to protect, and a guard that stops work when it is wrong
 * is worse than no guard. So: exit 0, always, unless asked for `--strict`.
 *
 *   node tooling/ci/claim-staleness.mjs           report, exit 0
 *   node tooling/ci/claim-staleness.mjs --strict  exit 1 if any claim looks spent
 *
 * Git only, no network: a branch that no longer exists on the remote is the
 * strongest signal available here, because this repo deletes on merge.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CLAIMS_DIR = join(ROOT, 'docs', 'ops', 'claims');
const STRICT = process.argv.includes('--strict');

/** The statuses that hide a tracker mountain from the free board. */
const HIDING = ['claimed', 'pr-open', 'wip'];

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim() };
}

function field(body, key) {
  const m = body.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*([^\\n]*)`, 'i'));
  return m ? m[1].trim().replace(/[`*]/g, '') : '';
}

/**
 * Did this claim's work land? Returns a reason string, or null if it looks live.
 *
 * Deliberately conservative: anything that cannot be checked is reported as
 * unverifiable rather than as spent. A false "spent" hands somebody else's live
 * mountain out for a second build, which is the collision the board exists to
 * prevent.
 */
function landedReason(branch) {
  if (!branch) return null;

  const exists = git(['rev-parse', '--verify', '-q', `origin/${branch}`]).ok;
  if (!exists) return `origin/${branch} no longer exists — this repo deletes on merge`;

  const cherry = spawnSync('bash', ['-c', `git cherry origin/main origin/${branch} | grep -c '^+' || true`], { encoding: 'utf8' });
  const unmerged = Number((cherry.stdout || '0').trim());
  if (Number.isFinite(unmerged) && unmerged === 0) return `every commit on origin/${branch} is already on main`;

  return null;
}

const spent = [];
const unverifiable = [];
let held = 0;

for (const file of readdirSync(CLAIMS_DIR).sort()) {
  if (!file.startsWith('TRK-') || !file.endsWith('.md')) continue;

  const body = readFileSync(join(CLAIMS_DIR, file), 'utf8');
  const raw = field(body, 'status').toLowerCase().replace(/[,.]$/, '');
  const status = raw || 'claimed'; // missing status reads as an active lock, per swarm.mjs
  if (!HIDING.includes(status)) continue;

  held++;
  const id = file.replace(/\.md$/, '');
  /**
   * `tip:` is a branch on some claims and a mood on others — "pending-merge",
   * "in-flight". A mood is not checkable, and treating one as a branch name
   * made two claims fall through this loop reporting nothing at all, which is
   * the failure this script exists to catch happening inside the script.
   */
  const named = field(body, 'branch') || field(body, 'tip');
  const branch = /^[\w./-]+$/.test(named) && !/^(pending-merge|in-flight|on|none|n\/a|tbd)$/i.test(named) ? named : '';
  const owner = field(body, 'owner') || field(body, 'owner session') || 'unnamed';
  const reason = landedReason(branch);

  if (reason) spent.push({ id, status, owner, reason });
  else if (!branch) unverifiable.push({ id, status, owner });
}

console.log(`claim-staleness — ${held} TRK claim(s) currently hiding a mountain from the free board`);

if (spent.length > 0) {
  console.log(`\n⚠ ${spent.length} look SPENT — the work landed and the lock was never written back:\n`);
  for (const s of spent) {
    console.log(`    ${s.id}  [${s.status}]  owner: ${s.owner}`);
    console.log(`        ${s.reason}`);
  }
  console.log('\n  Close each one: set **status:** merged with a **proof:** naming the PR.');
  console.log('  That does NOT hide the mountain afterwards — a claim covers one SLICE, and the');
  console.log('  next stage goes back on the free board (swarm.mjs, 2026-08-07).');
}

if (unverifiable.length > 0) {
  console.log(`\n  ${unverifiable.length} name no branch, so nothing here can check them:`);
  for (const u of unverifiable) console.log(`    ${u.id}  [${u.status}]  owner: ${u.owner}`);
  console.log('  Not a finding — add **branch:** to a claim and this can answer for it.');
}

if (spent.length === 0) console.log('\n✓ no claim is holding a mountain it has already shipped');

process.exit(STRICT && spent.length > 0 ? 1 : 0);
