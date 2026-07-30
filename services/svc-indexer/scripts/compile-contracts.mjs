#!/usr/bin/env node
/**
 * Compile this service's dev fixtures.
 *
 * The only Solidity svc-indexer owns is `contracts/dev/DevVenue.sol`, and it is
 * a log emitter for tests — read its header before assuming otherwise. The
 * output is committed under `contracts/out/` so tests and CI do not each pay a
 * multi-second wasm compile, and every artefact carries a `sourceHash` that
 * `src/chain/evm/abi.test.ts` re-derives from the tree. Stale bytecode that
 * still looks authoritative is the failure mode being prevented.
 *
 *   pnpm --filter @intafaced/svc-indexer contracts:build
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { collectSources, computeSourceHash, EXPECTED_SOLC, OUT_DIR, SETTINGS, SUITES, suiteSources } from './contract-sources.mjs';

const require = createRequire(import.meta.url);
const solc = require('solc');

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
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: SETTINGS })));
  const diagnostics = output.errors ?? [];
  const errors = diagnostics.filter((e) => e.severity === 'error');

  for (const warning of diagnostics.filter((e) => e.severity !== 'error')) {
    console.warn(`  warn  ${(warning.formattedMessage ?? warning.message).trim()}`);
  }
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
            _generated: 'pnpm --filter @intafaced/svc-indexer contracts:build — do not edit by hand',
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

console.log(`\nsolc ${actualVersion} · evmVersion ${SETTINGS.evmVersion} · ${written} artefact(s) → contracts/out`);
process.exit(failed ? 1 : 0);
