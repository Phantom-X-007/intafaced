#!/usr/bin/env node
/**
 * agent-pr — PR open for agents.
 *
 *   pnpm pr -- --title "…" --body "…"
 *   node tooling/scripts/agent-pr.mjs create …   # any gh pr create args after --
 *
 * A thin wrapper over `gh pr create` that survives `pnpm pr -- …` argument
 * mangling. It used to run a thrift meter first; thrift was deleted on
 * 2026-08-07 because the repo is public and GitHub Actions are free and
 * unlimited on standard runners, so there was no bill left to meter.
 *
 * There is deliberately no gate here. Opening a PR is how work is claimed —
 * a tool that can refuse to open one is a tool that stops the build.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let args = process.argv.slice(2);
// pnpm pr -- --title …  leaves a leading "--" that gh rejects as unknown.
while (args[0] === '--') args = args.slice(1);
// strip optional leading "create"
const ghArgs = args[0] === 'create' ? args.slice(1) : args;
const r = spawnSync('gh', ['pr', 'create', ...ghArgs], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});
process.exit(r.status === null ? 1 : r.status);
