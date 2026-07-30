/**
 * The compilation INPUT — shared by the compiler and by the test that checks
 * the committed output still matches the source.
 *
 * It lives apart from `compile-contracts.mjs` for one reason: that script does
 * work at import time (it compiles), so a test cannot import it just to reuse
 * the hashing. Everything here is pure.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACTS_DIR = join(SERVICE_ROOT, 'contracts');
export const OUT_DIR = join(CONTRACTS_DIR, 'out');

/** Pinned in package.json. A floating install must be loud, not silent. */
export const EXPECTED_SOLC = '0.8.28';

/**
 * Compiler settings. Any change here changes the bytecode, which changes every
 * CREATE2 address derived from it — so they are part of the source hash.
 *
 * `paris` is deliberate. Shanghai introduced PUSH0 and several chains that
 * matter to a permissionless account layer had not adopted it; paris bytecode
 * runs everywhere later bytecode runs, and a local dev chain does not get to
 * make that decision on production's behalf.
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
    // the integrity test fails for a reason that has nothing to do with the code.
    sources[key] = { content: readFileSync(full, 'utf8').replace(/\r\n/g, '\n') };
  }
  return sources;
}

/**
 * One hash over a suite's whole compilation input: sources, compiler version
 * and settings. Anything that could change the bytecode is inside it, which is
 * what makes a committed artefact checkable against the tree it came from.
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
 * Suites are compiled separately so one broken contract cannot take the rest of
 * the tree with it — and so a known breakage is PINNED rather than tolerated.
 *
 * `expect: 'fails'` is not a shrug. The suite must fail, and fail with the
 * recorded signature. If it starts compiling, or breaks differently, the build
 * goes red and somebody has to look. A warning nobody must act on is how a gate
 * stops being a gate.
 */
export const SUITES = [
  {
    name: 'accounts',
    expect: 'compiles',
    /** §17.4 — the smart account layer. This is what `svc-protocol` serves. */
    sources: ['AccountFactory.sol', 'SessionKeyLib.sol', 'SmartAccount.sol', 'interfaces/IAccount.sol'],
  },
  {
    name: 'launch',
    expect: 'compiles',
    /**
     * §8.4 — the token factory (`launch.token-factory`).
     *
     * Its own suite rather than folded into `accounts`, for the reason the
     * `amm` entry below demonstrates: a suite is the blast radius of a broken
     * contract. It also keeps `sourceHash` separate, so editing a launch
     * template does not mark every account artefact stale, or the reverse.
     */
    sources: ['launch/SovereignToken.sol', 'launch/TokenFactory.sol'],
  },
  {
    name: 'amm',
    expect: 'fails',
    /**
     * `protocol.amm` — BLOCKED, and now demonstrably so at the contract layer.
     *
     * `ConstantProductPool.swap` is declared `external`, and `swapExactIn`
     * calls it by name at lines 177 and 179. Solidity does not allow an
     * external function to be called internally, so this file has never
     * produced bytecode and the pool as written is undeployable. Nobody knew,
     * because until `compile-contracts.mjs` landed nothing in this repository
     * had ever run a Solidity compiler.
     *
     * NOT FIXED HERE, deliberately. The fix changes a money contract's external
     * surface (`external` → `public`, or an internal `_swap` the two callers
     * share) on a feature that belongs to `protocol.amm`, not to standing up a
     * dev chain. Changing what a pool exposes as a side effect of adding a
     * build script is the kind of edit that gets waved through in review. It is
     * pinned here so whoever opens `protocol.amm` finds it in the first ten
     * seconds instead of the first ten hours.
     */
    sources: ['amm/ConstantProductPool.sol', 'amm/IERC20Minimal.sol', 'amm/PoolFactory.sol'],
    expectedError: 'Undeclared identifier',
  },
];

/** The exact `sources` object a suite is compiled from. */
export function suiteSources(suite, all = collectSources()) {
  const missing = suite.sources.filter((key) => !(key in all));
  if (missing.length > 0) throw new Error(`suite "${suite.name}": missing source(s) ${missing.join(', ')}`);
  return Object.fromEntries([...suite.sources].sort().map((key) => [key, all[key]]));
}
