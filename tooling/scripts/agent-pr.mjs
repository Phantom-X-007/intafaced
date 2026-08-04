#!/usr/bin/env node
/**
 * agent-pr — fail-closed PR open for agents (thrift first, then gh).
 *
 *   pnpm pr -- --title "…" --body "…"
 *   node tooling/scripts/agent-pr.mjs create …   # any gh pr create args after --
 *
 * Runs thrift-preflight (hard fail unless THRIFT_ALLOW=1), then `gh pr create`.
 * Prefer this over bare `gh pr create` in AFK / swarm workers.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const thrift = join(ROOT, 'tooling/ci/thrift-preflight.mjs');

const thriftRun = spawnSync(process.execPath, [thrift], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});
if (thriftRun.status !== 0) {
  console.error('agent-pr: thrift-preflight blocked PR open. Batch work or wait for 24h cool-down.');
  console.error('  Emergency only: THRIFT_ALLOW=1 pnpm pr -- …');
  process.exit(thriftRun.status || 1);
}

const args = process.argv.slice(2);
// strip optional leading "create"
const ghArgs = args[0] === 'create' ? args.slice(1) : args;
const r = spawnSync('gh', ['pr', 'create', ...ghArgs], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});
process.exit(r.status === null ? 1 : r.status);
