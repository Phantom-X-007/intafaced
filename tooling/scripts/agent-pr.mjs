#!/usr/bin/env node
/**
 * agent-pr — PR open for agents (thrift meter first, then gh).
 *
 *   pnpm pr -- --title "…" --body "…"
 *   node tooling/scripts/agent-pr.mjs create …   # any gh pr create args after --
 *
 * Runs thrift-preflight (meter + WARN only — never blocks on run counts), then
 * `gh pr create`. Prefer this over bare `gh pr create` in AFK / swarm workers
 * so the Actions meter stays visible. Do not open coordination-only PRs
 * (SWARM-MANDATE / AGENTS thrift).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const thrift = join(ROOT, 'tooling/ci/thrift-preflight.mjs');

// Meter only — thrift always exits 0 on run-count signals (local-first law).
spawnSync(process.execPath, [thrift], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});

const args = process.argv.slice(2);
// strip optional leading "create"
const ghArgs = args[0] === 'create' ? args.slice(1) : args;
const r = spawnSync('gh', ['pr', 'create', ...ghArgs], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});
process.exit(r.status === null ? 1 : r.status);
