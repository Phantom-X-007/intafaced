#!/usr/bin/env node
/**
 * THE PROJECT TRACKER.
 *
 *   pnpm tracker          render docs/TRACKER.md and print the summary
 *   pnpm tracker:check    fail if TRACKER.md is stale or the registry is invalid (CI)
 *   pnpm tracker ready    just list what is claimable right now
 *   pnpm tracker <module> everything for one module
 *
 * A tracker is only useful if it is TRUE. Two mechanisms keep it honest:
 *
 *   1. `blocked` is COMPUTED, never declared. A feature is blocked when a
 *      dependency is not done — so nobody can mark something ready by wishing.
 *   2. `done` is VALIDATED against the repo. A feature claiming done whose
 *      service does not exist on disk fails the check. You cannot tick a box
 *      for code that is not there.
 *
 * CI runs `tracker:check`, so a PR that ships a feature without updating the
 * registry — or updates the registry without shipping — goes red.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { FEATURES, PHASE_ORDER, PHASE_NAMES } from '../tracker/features.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = join(ROOT, 'docs', 'TRACKER.md');
const arg = process.argv[2];
const checkMode = arg === '--check' || arg === 'check';

// ── Validate ────────────────────────────────────────────────────────────────

const byId = new Map(FEATURES.map((f) => [f.id, f]));
const problems = [];

for (const feature of FEATURES) {
  for (const dep of feature.dependsOn) {
    if (!byId.has(dep)) problems.push(`${feature.id}: depends on unknown feature "${dep}"`);
  }

  // The anti-wishful-thinking check.
  if (feature.status === 'done') {
    for (const path of feature.requires) {
      if (!existsSync(join(ROOT, path))) {
        problems.push(`${feature.id}: claims "done" but ${path} does not exist`);
      }
    }
  }

  if (feature.status === 'wip' && !feature.owner) {
    problems.push(`${feature.id}: is "wip" with no owner — who is on it?`);
  }
}

const ids = FEATURES.map((f) => f.id);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
for (const id of new Set(duplicates)) problems.push(`duplicate feature id: ${id}`);

// ── Resolve status ──────────────────────────────────────────────────────────

/** Declared status, except that unmet dependencies force `blocked`. */
function resolve(feature) {
  if (feature.status === 'done' || feature.status === 'socket') return feature.status;

  const unmet = feature.dependsOn.filter((d) => byId.get(d)?.status !== 'done');
  if (unmet.length > 0) return 'blocked';

  return feature.status;
}

const resolved = FEATURES.map((f) => ({ ...f, resolved: resolve(f) }));
const blockers = (f) => f.dependsOn.filter((d) => byId.get(d)?.status !== 'done');

// ── Render ──────────────────────────────────────────────────────────────────

const ICON = { done: '✅', wip: '🔨', ready: '🟢', blocked: '⛔', socket: '🔌' };

function summary() {
  const counts = { done: 0, wip: 0, ready: 0, blocked: 0, socket: 0 };
  for (const f of resolved) counts[f.resolved]++;
  return counts;
}

function render() {
  const counts = summary();
  const shippable = resolved.filter((f) => f.resolved !== 'socket').length;
  const percent = Math.round((counts.done / shippable) * 100);

  const lines = [];
  lines.push('# Project tracker');
  lines.push('');
  lines.push('> **Generated — do not edit by hand.** Source of truth is `tooling/tracker/features.mjs`.');
  lines.push('> Run `pnpm tracker` after changing it. CI fails if this file is stale.');
  lines.push('');
  lines.push(`**${counts.done} of ${shippable} shipped (${percent}%)** · ${counts.wip} in progress · ${counts.ready} ready to claim · ${counts.blocked} blocked · ${counts.socket} deliberate §13 sockets`);
  lines.push('');
  lines.push('| | meaning |');
  lines.push('|---|---|');
  lines.push('| ✅ done | on `main`, DoD gate green |');
  lines.push('| 🔨 wip | someone is on it — see owner |');
  lines.push('| 🟢 ready | **every dependency is done. Claim it.** |');
  lines.push('| ⛔ blocked | waiting on a dependency — computed, not declared |');
  lines.push('| 🔌 socket | deliberately not in v1 (§13); the interface exists |');
  lines.push('');

  // ── Claim this now ────────────────────────────────────────────────────────
  const ready = resolved.filter((f) => f.resolved === 'ready');
  lines.push('---');
  lines.push('');
  lines.push('## 🟢 Claim these now');
  lines.push('');
  lines.push('Nothing blocks these. Pick one, say so in Telegram, open a branch:');
  lines.push('');
  lines.push('```bash');
  lines.push('pnpm wt feat/<the-thing>');
  lines.push('```');
  lines.push('');

  if (ready.length === 0) {
    lines.push('_Nothing unblocked right now — everything is either shipped, in progress, or waiting._');
  } else {
    lines.push('| Feature | Module | Phase | id |');
    lines.push('|---|---|---|---|');
    for (const f of ready) {
      lines.push(`| ${f.title} | \`${f.module}\` | ${f.phase} | \`${f.id}\` |`);
    }
  }
  lines.push('');

  const wip = resolved.filter((f) => f.resolved === 'wip');
  if (wip.length > 0) {
    lines.push('## 🔨 In progress');
    lines.push('');
    lines.push('| Feature | Owner | Module |');
    lines.push('|---|---|---|');
    for (const f of wip) lines.push(`| ${f.title} | **${f.owner}** | \`${f.module}\` |`);
    lines.push('');
  }

  // ── By phase ──────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('## Everything, by phase');
  lines.push('');

  for (const phase of PHASE_ORDER) {
    const inPhase = resolved.filter((f) => f.phase === phase);
    if (inPhase.length === 0) continue;

    const done = inPhase.filter((f) => f.resolved === 'done').length;
    const total = inPhase.filter((f) => f.resolved !== 'socket').length;
    const complete = total > 0 && done === total;

    lines.push(`### Phase ${phase} — ${PHASE_NAMES[phase]} ${complete ? '✅' : `(${done}/${total})`}`);
    lines.push('');
    lines.push('| | Feature | Plane | Blocked by | id |');
    lines.push('|---|---|---|---|---|');

    for (const f of inPhase) {
      const blocked = f.resolved === 'blocked' ? blockers(f).map((b) => `\`${b}\``).join(', ') : '';
      const note = f.note ? ` <br/>_${f.note}_` : '';
      lines.push(`| ${ICON[f.resolved]} | ${f.title}${note} | ${f.plane} | ${blocked} | \`${f.id}\` |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## How to use this');
  lines.push('');
  lines.push('**To claim something:** find it in 🟢, set `owner` and `status: "wip"` in `tooling/tracker/features.mjs`, run `pnpm tracker`, and include both files in your first PR. That way nobody duplicates you.');
  lines.push('');
  lines.push('**To ship something:** set `status: "done"` and list the paths it created in `requires`. The check will refuse the claim if those paths are missing.');
  lines.push('');
  lines.push('**Plane:** `F` = Fiat (custodial, compliant) · `P` = Protocol (non-custodial, zero-KYC) · `B` = both. See §22.');
  lines.push('');
  lines.push('**Why blocked is computed:** so the tracker cannot lie about readiness. If you think something is wrongly blocked, the fix is in `dependsOn`, and that edit is reviewable.');
  lines.push('');

  return lines.join('\n');
}

// ── Run ─────────────────────────────────────────────────────────────────────

if (problems.length > 0) {
  console.error(`\n✖ TRACKER REGISTRY INVALID — ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error('');
  process.exit(1);
}

const content = render();

/**
 * Never `process.exit(0)` after writing to stdout: on Windows a piped stdout is
 * asynchronous, and exiting truncates the pending write AND reports a garbage
 * exit code. Let Node finish naturally instead — CI reads these codes.
 */
if (checkMode) {
  const existing = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (existing.trim() !== content.trim()) {
    console.error('\n✖ docs/TRACKER.md is stale. Run `pnpm tracker` and commit the result.\n');
    process.exitCode = 1;
  } else {
    console.log('✓ tracker up to date');
  }
} else if (arg) {
  // Filters — for humans at a terminal, not for the file.
  const filtered =
    arg === 'ready'
      ? resolved.filter((f) => f.resolved === 'ready')
      : resolved.filter((f) => f.module === arg || f.phase === arg);

  if (filtered.length === 0) {
    console.log(`\nNothing matches "${arg}". Try a module id, a phase, or "ready".\n`);
  } else {
    console.log('');
    for (const f of filtered) {
      const blocked = f.resolved === 'blocked' ? `  ← blocked by ${blockers(f).join(', ')}` : '';
      console.log(`  ${ICON[f.resolved]} ${f.id.padEnd(28)} ${f.title}${blocked}`);
    }
    console.log('');
  }
} else {
  writeFileSync(OUTPUT, content + '\n', 'utf8');

  const counts = summary();
  const shippable = FEATURES.filter((f) => f.status !== 'socket').length;
  console.log('\n✓ docs/TRACKER.md written\n');
  console.log(
    `  ✅ ${counts.done} shipped of ${shippable}   🔨 ${counts.wip} wip   🟢 ${counts.ready} ready   ⛔ ${counts.blocked} blocked   🔌 ${counts.socket} sockets\n`,
  );

  if (counts.ready > 0) {
    console.log('  Ready to claim:');
    for (const f of resolved.filter((r) => r.resolved === 'ready')) {
      console.log(`    · ${f.id.padEnd(28)} ${f.title}`);
    }
    console.log('');
  }

  // Nudge, not a failure: a tracker whose file is uncommitted helps nobody.
  try {
    const status = execFileSync('git', ['status', '--porcelain', 'docs/TRACKER.md'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (status) console.log('  (docs/TRACKER.md changed — commit it so the team sees the same picture)\n');
  } catch {
    /* not a git repo; fine */
  }
}
