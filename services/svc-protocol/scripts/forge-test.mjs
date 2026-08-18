#!/usr/bin/env node
/**
 * S-A8 — run Foundry fuzz tests without replacing solc-js as the compiler.
 *
 * CI uses the same foundry image as anvil (`ghcr.io/foundry-rs/foundry:v1.5.1`).
 * A laptop without Docker or forge skips unless CI / REQUIRE_FORGE is set.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = process.env.CI === 'true' || process.env.CI === '1' || process.env.REQUIRE_FORGE === '1';
const image = 'ghcr.io/foundry-rs/foundry:v1.5.1';

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
}

const forge = spawnSync('forge', ['test', '--fuzz-runs', '64'], { stdio: 'inherit', cwd: root });
if (!forge.error) process.exit(forge.status ?? 1);
if (forge.error.code !== 'ENOENT' && required) process.exit(1);

const docker = run('docker', ['run', '--rm', '-v', `${root}:/work`, '-w', '/work', image, 'forge test --fuzz-runs 64']);
if (docker.status === 0) process.exit(0);

if (!required) {
  console.log('forge tests skipped (no forge on PATH, docker unavailable). CI runs them.');
  process.exit(0);
}

console.error('REQUIRE_FORGE/CI: forge tests must run (install forge or Docker).');
process.exit(docker.status === null ? 1 : docker.status);
