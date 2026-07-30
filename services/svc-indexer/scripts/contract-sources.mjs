/**
 * WHERE THIS SERVICE'S DEV FIXTURE IS, AND WHICH COMPILER BUILDS IT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PINNED TOOLCHAIN IS NOT DEFINED HERE — IT IS IMPORTED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `EXPECTED_SOLC`, `SETTINGS`, `sha256`, `collectSources` and
 * `computeSourceHash` come from `@intafaced/svc-protocol/scripts/`, which is
 * where #210 put them. They are re-exported below so this service's compiler and
 * its integrity test read the same names, but there is exactly ONE definition of
 * each in the repository.
 *
 * That is deliberate and it is the whole point. The first draft of this file
 * copied those five things, and a copy is not a pin: the moment svc-protocol
 * moves `evmVersion` from `paris` to `cancun`, or bumps the optimizer runs, two
 * services in one repo produce bytecode from settings that no longer agree — and
 * nothing goes red, because each copy is internally consistent. Deterministic
 * bytecode is the entire reason #210 chose a locked solc-js over `forge build`,
 * and a forked settings object throws that away quietly.
 *
 * `collectSources` is the one exception, and it is not toolchain. svc-protocol's
 * version keys every file with `relative(ITS OWN contracts dir, …)` — a
 * module-level constant, not its `dir` argument — so pointing it at another tree
 * produces keys like `../../svc-indexer/contracts/…` and the suite lookup misses.
 * Making it reusable means editing svc-protocol, which is the thing this file
 * exists to avoid, so the twelve-line directory walk is local. It cannot cause
 * bytecode drift: what determines bytecode is the compiler version, the settings
 * and the file contents, and all three of those are shared or read from disk. The
 * CRLF normalisation is kept identical because the source hash depends on it.
 *
 * ── What this costs, stated plainly ─────────────────────────────────────────
 *
 * A `devDependencies` edge from svc-indexer to svc-protocol. It is dev-only
 * (excluded by `pnpm install --prod`, so it is in no shipped image), it reaches
 * only `scripts/`, which imports nothing but node builtins and is never
 * compiled, and it touches no runtime code, no schema and no contract of
 * svc-protocol's. Nothing in svc-protocol was edited to make it work: that
 * package declares no `exports` map, so the subpath already resolves.
 *
 * The alternative was extracting a `tooling/solidity` workspace package and
 * migrating both callers. That is the better end state and it should happen when
 * a third caller appears — but it means editing svc-protocol's scripts, which
 * another agent is changing right now for `launch.token-factory`, and a
 * three-way conflict in the file that pins the compiler is a worse outcome than
 * an import.
 *
 * ── What is genuinely local ─────────────────────────────────────────────────
 *
 * Paths and the suite list. Those are configuration, not toolchain: svc-indexer
 * compiles its own directory into its own `out/`, and saying so is not
 * duplication.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSourceHash, EXPECTED_SOLC, sha256, SETTINGS } from '@intafaced/svc-protocol/scripts/contract-sources.mjs';

export { computeSourceHash, EXPECTED_SOLC, sha256, SETTINGS };

export const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACTS_DIR = join(SERVICE_ROOT, 'contracts');
export const OUT_DIR = join(CONTRACTS_DIR, 'out');

/** Every `.sol` under contracts/, keyed by a posix path relative to contracts/. */
export function collectSources(dir = CONTRACTS_DIR) {
  const sources = {};
  for (const name of readdirSync(dir).sort()) {
    if (name === 'out') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      Object.assign(sources, collectSources(full));
      continue;
    }
    if (!name.endsWith('.sol')) continue;
    const key = relative(CONTRACTS_DIR, full).split('\\').join('/');
    // Normalise line endings: this repo is developed on Windows and checked out
    // on Linux CI. A CRLF checkout must not produce a different sourceHash, or
    // the integrity test fails for a reason unrelated to the code.
    sources[key] = { content: readFileSync(full, 'utf8').replace(/\r\n/g, '\n') };
  }
  return sources;
}

/**
 * One suite, and it is dev-only on purpose.
 *
 * If a second suite ever appears here, ask hard whether it belongs in this
 * service at all — svc-indexer READS chain state. It does not own contracts, and
 * the one `.sol` under `contracts/` is a log emitter for tests.
 */
export const SUITES = [
  {
    name: 'dev',
    expect: 'compiles',
    sources: ['dev/DevVenue.sol'],
  },
];

/** The exact `sources` object a suite is compiled from, out of THIS service's tree. */
export function suiteSources(suite, all = collectSources(CONTRACTS_DIR)) {
  const missing = suite.sources.filter((key) => !(key in all));
  if (missing.length > 0) throw new Error(`suite "${suite.name}": missing source(s) ${missing.join(', ')}`);
  return Object.fromEntries([...suite.sources].sort().map((key) => [key, all[key]]));
}

/**
 * `solc` is still a devDependency of BOTH services, because pnpm's strict
 * isolation means svc-indexer cannot resolve a package only svc-protocol
 * declared. Two version strings in two package.json files is the one piece of
 * drift the shared import cannot prevent — so it is asserted rather than hoped
 * for.
 *
 * Called by the compiler and by `src/chain/evm/abi.test.ts`, so it fails on a
 * plain `pnpm test` and not only when somebody happens to rebuild contracts.
 */
export function assertSolcPinAgrees() {
  const declared = JSON.parse(readFileSync(join(SERVICE_ROOT, 'package.json'), 'utf8')).devDependencies?.solc;
  if (declared !== EXPECTED_SOLC) {
    throw new Error(
      `svc-indexer pins solc "${declared}" but the shared toolchain (svc-protocol/scripts/contract-sources.mjs) ` +
        `expects "${EXPECTED_SOLC}". Two compilers in one repo produce two bytecodes. Align the pins.`,
    );
  }
  return EXPECTED_SOLC;
}
