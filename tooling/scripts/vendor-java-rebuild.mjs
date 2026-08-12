#!/usr/bin/env node
/**
 * Vendor Java rebuild path (D26-P2-07 · D-S-17 · ADR 2026-08-04).
 *
 * Compose runs `<module>/target/<module>.jar` from gitignored, often-stale
 * artifacts. Source scans (`vendor-java-money-scan`) prove what the SOURCE
 * says; they prove nothing about those jars. This script is the reproducible
 * rebuild path that ties scanned source to the artifacts compose would run.
 *
 * Usage:
 *   node tooling/scripts/vendor-java-rebuild.mjs           # package compose modules
 *   node tooling/scripts/vendor-java-rebuild.mjs --dry-run # print the mvn line only
 *   node tooling/scripts/vendor-java-rebuild.mjs --check   # exit 0 if mvn+jdk present
 *
 * Exit codes:
 *   0 — rebuild succeeded, or --check/--dry-run ok
 *   1 — rebuild failed
 *   2 — toolchain missing (no JDK / no mvn) — honest, not a silent skip
 *
 * Does NOT vendor a new jar onto a money classpath to force a boot
 * (ADR standing rule). Does NOT touch 01_wallet_rpc (owner-gated).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const FRAMEWORK = join(ROOT, 'vendor', 'upstream-exchange', '00_framework');
const COMPOSE = join(ROOT, 'vendor', 'upstream-exchange-compose.yml');

const DRY = process.argv.includes('--dry-run');
const CHECK = process.argv.includes('--check');

/**
 * Modules whose jars compose actually launches. Parsed from the compose file
 * so a new coinex-* jar reference cannot silently fall off the rebuild list.
 */
export function composeJarModules(composeText) {
  const mods = new Set();
  // Compose lists jars as `cloud/target/cloud.jar` (array elems, -jar flags, etc.).
  // Require the basename to match the module directory so a random `foo/target/bar.jar`
  // dependency path cannot inflate the rebuild set.
  for (const m of composeText.matchAll(/\b([a-z0-9_-]+)\/target\/\1\.jar\b/gi)) {
    mods.add(m[1]);
  }
  return [...mods].sort();
}

function findMvn() {
  const isWin = process.platform === 'win32';
  const candidates = isWin ? ['mvn.cmd', 'mvn'] : ['mvn'];
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['-v'], { encoding: 'utf8', shell: isWin });
    if (probe.status === 0) return bin;
  }
  return null;
}

function main() {
  if (!existsSync(FRAMEWORK)) {
    console.error('✖ vendor-java-rebuild: framework tree missing — cannot rebuild jars from scanned source');
    process.exit(1);
  }
  if (!existsSync(COMPOSE)) {
    console.error('✖ vendor-java-rebuild: vendor/upstream-exchange-compose.yml missing — no jar inventory');
    process.exit(1);
  }

  const modules = composeJarModules(readFileSync(COMPOSE, 'utf8'));
  if (modules.length === 0) {
    console.error('✖ vendor-java-rebuild: compose declares no module/target/<module>.jar paths');
    process.exit(1);
  }

  const mvn = findMvn();
  const args = ['-B', '-q', `-pl`, modules.join(','), '-am', '-DskipTests', 'package'];

  if (DRY) {
    console.log(`vendor-java-rebuild dry-run — would run: ${mvn ?? 'mvn'} ${args.join(' ')}`);
    console.log(`  cwd: vendor/upstream-exchange/00_framework`);
    console.log(`  modules (${modules.length}): ${modules.join(', ')}`);
    console.log('  note: source scan ≠ runtime safety until this rebuild succeeds and compose uses the new jars');
    process.exit(0);
  }

  if (!mvn) {
    console.error('✖ vendor-java-rebuild: Maven not on PATH (no JDK/mvn toolchain)');
    console.error('  Install OpenJDK 8 + Maven 3.8 (see .github/workflows/vendor-compile.yml image), then re-run.');
    console.error('  Until then: runtime posture is UNVERIFIED — do not cite vendor-java-money-scan as jar truth.');
    process.exit(CHECK ? 2 : 2);
  }

  if (CHECK) {
    console.log(`✓ vendor-java-rebuild toolchain present (${mvn}); modules: ${modules.join(', ')}`);
    process.exit(0);
  }

  console.log(`vendor-java-rebuild — packaging ${modules.length} compose module(s) from scanned source…`);
  const run = spawnSync(mvn, args, {
    cwd: FRAMEWORK,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    console.error(`✖ vendor-java-rebuild: mvn package failed (exit ${run.status ?? 'signal'})`);
    process.exit(1);
  }
  console.log(
    `✓ vendor-java-rebuild — packaged ${modules.join(', ')} from scanned source; ` +
      'compose jars now match this tree (source scan alone still is not a safety claim without this step)',
  );
}

const RUN_AS_SCRIPT = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (RUN_AS_SCRIPT) main();
