#!/usr/bin/env node
/**
 * THE SOLIDITY TOOLCHAIN (§13 socket `socket.contract-toolchain`, closed here).
 *
 * Until this script existed, `contracts/*.sol` had never been executed. It had
 * never even been *compiled*: `src/chain/abi.ts` says so in its own header —
 * "hand-written ... because there is no Solidity compiler in this toolchain
 * yet". A contract nobody has compiled is a design document that looks like
 * code, and `AccountFactory.getAddress` was the one function in this repository
 * whose disagreement with TypeScript would cost a user real money.
 *
 * The first run proved the point immediately: see the `amm` suite in
 * `contract-sources.mjs`. `ConstantProductPool` does not compile and never has.
 *
 * ── Why solc-js and not Foundry/Hardhat ─────────────────────────────────────
 *
 * `solc` is the Solidity compiler itself, published to npm as the emscripten
 * build the Solidity team release alongside every native binary. That buys
 * three things this monorepo needs and a native toolchain does not give:
 *
 *   1. It is a pinned devDependency in `pnpm-lock.yaml`, so every machine and
 *      every CI runner compiles with the same compiler. `forge build` downloads
 *      a solc at first use into a user-level cache, which is a version nobody
 *      reviews.
 *   2. It needs no second package manager, no Rust toolchain, no `foundry.toml`
 *      and no `lib/` submodules. `pnpm install` is the whole setup — on Windows
 *      too, which is where this repo is developed.
 *   3. It is a *compiler*, not a framework. Anvil is still the dev chain (the
 *      `evm` service in docker-compose.yml); this only turns source into
 *      bytecode. Keeping those jobs separate is why the local chain can be
 *      swapped without touching how contracts are built.
 *
 * ── Why the output is committed ─────────────────────────────────────────────
 *
 * `contracts/out/` is in git. A reviewer can see the exact bytecode a
 * deployment will push, `deploy-dev.ts` and the test suite do not each pay a
 * multi-second wasm compile, and CI does not have to run a compiler to run
 * tests.
 *
 * Committed output is only trustworthy if it can be shown to match the source,
 * so every artefact records `sourceHash`. `src/chain/artifacts.test.ts`
 * recomputes it from the tree and fails if somebody edits a `.sol` without
 * re-running this script. Stale bytecode that still looks authoritative is the
 * failure mode being prevented.
 *
 *   pnpm --filter @intafaced/svc-protocol contracts:build
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { collectSources, computeSourceHash, EXPECTED_SOLC, OUT_DIR, SETTINGS, SUITES, suiteSources } from './contract-sources.mjs';

const require = createRequire(import.meta.url);
const solc = require('solc');

function compile(sources) {
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: SETTINGS })));
  return {
    output,
    errors: (output.errors ?? []).filter((e) => e.severity === 'error'),
    warnings: (output.errors ?? []).filter((e) => e.severity !== 'error'),
  };
}

const actualVersion = solc.version();
if (!actualVersion.startsWith(EXPECTED_SOLC)) {
  console.error(`solc is ${actualVersion}, expected ${EXPECTED_SOLC}.x — the pin in package.json moved without this script.`);
  process.exit(1);
}

const all = collectSources();
let failed = false;
let written = 0;

for (const suite of SUITES) {
  const sources = suiteSources(suite, all);
  const sourceHash = computeSourceHash(sources);
  const { output, errors, warnings } = compile(sources);

  if (suite.expect === 'fails') {
    const signature = errors.map((e) => e.formattedMessage ?? e.message).join('\n');
    if (errors.length === 0) {
      console.error(
        `\nsuite "${suite.name}" is pinned as known-broken but it COMPILED.\n` +
          `That is good news and it needs a deliberate change: flip expect to 'compiles' in\n` +
          `contract-sources.mjs, re-run, and commit the artefacts. Do not leave it pinned as broken.`,
      );
      failed = true;
    } else if (!signature.includes(suite.expectedError)) {
      console.error(
        `\nsuite "${suite.name}" failed differently than pinned.\n` + `  expected to contain: ${suite.expectedError}\n  got:\n${signature}`,
      );
      failed = true;
    } else {
      console.log(`\n[${suite.name}] KNOWN-BROKEN, as pinned — ${errors.length} error(s), first:`);
      console.log(`  ${(errors[0].formattedMessage ?? errors[0].message).trim().split('\n')[0]}`);
      console.log('  protocol.amm stays blocked at the contract layer. No artefacts written.');
    }
    continue;
  }

  for (const warning of warnings) console.warn(`  warn  ${(warning.formattedMessage ?? warning.message).trim()}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(error.formattedMessage ?? error.message);
    failed = true;
    continue;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n[${suite.name}] sourceHash ${sourceHash}`);
  for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [contractName, artefact] of Object.entries(contracts)) {
      const bytecode = `0x${artefact.evm.bytecode.object}`;
      // Interfaces and internal-only libraries compile to empty bytecode.
      // Writing them would be an artefact nobody can deploy.
      if (bytecode === '0x') continue;

      writeFileSync(
        join(OUT_DIR, `${contractName}.json`),
        `${JSON.stringify(
          {
            _generated: 'pnpm --filter @intafaced/svc-protocol contracts:build — do not edit by hand',
            contractName,
            sourceName,
            suite: suite.name,
            solcVersion: EXPECTED_SOLC,
            evmVersion: SETTINGS.evmVersion,
            optimizer: SETTINGS.optimizer,
            sourceHash,
            abi: artefact.abi,
            bytecode,
            deployedBytecode: `0x${artefact.evm.deployedBytecode.object}`,
            /**
             * Byte ranges the CONSTRUCTOR writes into the runtime — Solidity
             * `immutable` values. Zero placeholders in the output above, real
             * values on chain.
             *
             * Recorded so `deployedCodeMatches()` can compare a deployed
             * contract against this artefact honestly. Without it the only
             * available check is byte-equality, which is FALSE for every
             * correctly deployed contract that has an immutable — a check that
             * looks strict and rejects the truth.
             */
            immutableReferences: artefact.evm.deployedBytecode.immutableReferences ?? {},
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      written += 1;
      console.log(`  ${contractName.padEnd(22)} ${((bytecode.length - 2) / 2).toString().padStart(6)} bytes  ${sourceName}`);
    }
  }
}

console.log(`\nsolc ${actualVersion} · evmVersion ${SETTINGS.evmVersion} · ${written} artefacts → contracts/out`);
process.exit(failed ? 1 : 0);
