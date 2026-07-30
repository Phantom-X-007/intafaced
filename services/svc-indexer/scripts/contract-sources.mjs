/**
 * The compilation INPUT for this service's dev fixtures — shared by the
 * compiler and by the test that checks the committed output still matches the
 * source.
 *
 * It lives apart from `compile-contracts.mjs` for one reason: that script does
 * work at import time (it compiles), so a test cannot import it just to reuse
 * the hashing. Everything here is pure.
 *
 * ── Why this duplicates svc-protocol's script instead of sharing it ─────────
 *
 * Because sharing it means editing svc-protocol, and svc-protocol is being
 * worked on concurrently (`launch.token-factory`). Reaching across a service
 * boundary into another service's `scripts/` would also be a new kind of
 * coupling: the two are not one build system, they are two services that each
 * happen to compile a small amount of Solidity.
 *
 * The duplication is stated rather than hidden, and it is bounded: pull the
 * shared parts into `tooling/solidity/` when a third service needs them, in a
 * PR that owns both callers. `EXPECTED_SOLC` and `SETTINGS` below are pinned to
 * the SAME values svc-protocol pins, and `abi.test.ts` fails loudly if the
 * committed artefact drifts from the source it claims to describe.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACTS_DIR = join(SERVICE_ROOT, 'contracts');
export const OUT_DIR = join(CONTRACTS_DIR, 'out');

/** Pinned in package.json, and the same pin svc-protocol uses. */
export const EXPECTED_SOLC = '0.8.28';

/**
 * Compiler settings, identical to svc-protocol's.
 *
 * Nothing here is deployed anywhere real, so the settings do not have the
 * consequences they do there — but two Solidity toolchains in one repo that
 * disagree about `evmVersion` is a difference somebody will eventually spend an
 * afternoon on. Any change here changes the bytecode, so they are part of the
 * source hash.
 */
export const SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: 'paris',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
};

export function sha256(value) {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

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
 * One hash over the whole compilation input: sources, compiler version and
 * settings. Anything that could change the bytecode is inside it, which is what
 * makes a committed artefact checkable against the tree it came from.
 */
export function computeSourceHash(sources, version = EXPECTED_SOLC) {
  return sha256(
    JSON.stringify({
      solcVersion: version,
      settings: { optimizer: SETTINGS.optimizer, evmVersion: SETTINGS.evmVersion },
      sources: Object.fromEntries(
        Object.entries(sources)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([key, value]) => [key, sha256(value.content)]),
      ),
    }),
  );
}

/**
 * One suite, and it is dev-only on purpose.
 *
 * If a second suite ever appears here it should be asked hard whether it
 * belongs in this service at all — svc-indexer reads chain state, it does not
 * own contracts.
 */
export const SUITES = [
  {
    name: 'dev',
    expect: 'compiles',
    sources: ['dev/DevVenue.sol'],
  },
];

/** The exact `sources` object a suite is compiled from. */
export function suiteSources(suite, all = collectSources()) {
  const missing = suite.sources.filter((key) => !(key in all));
  if (missing.length > 0) throw new Error(`suite "${suite.name}": missing source(s) ${missing.join(', ')}`);
  return Object.fromEntries([...suite.sources].sort().map((key) => [key, all[key]]));
}
