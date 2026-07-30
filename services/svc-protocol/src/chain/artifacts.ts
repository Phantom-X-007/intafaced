import { readFileSync } from 'node:fs';
import type { Abi, Hex } from 'viem';

/**
 * The compiled contracts, loaded from `contracts/out/`.
 *
 * `contracts/*.sol` used to be source nobody had ever run through a compiler —
 * `abi.ts` still says so in its header, and it was true until
 * `scripts/compile-contracts.mjs` landed. This module is the seam between the
 * committed build output and everything that needs it: the dev-chain deployer,
 * and the tests that check the TypeScript in this service against the Solidity
 * it claims to mirror.
 *
 * ── One caller IS on a request path now, and has to be ─────────────────────
 *
 * This used to say "not on any request path": the service read chain state
 * through the hand-written ABI in `abi.ts`, nothing here was imported at boot,
 * and a missing `contracts/out` could therefore only ever be a build-time
 * problem.
 *
 * `src/launch/address.ts` changes that, unavoidably. A smart account is an
 * EIP-1167 clone whose creation code is 55 bytes derivable from constants; a
 * launched token is a full contract, so its CREATE2 init code IS the compiler's
 * `bytecode` output. There is no way to predict a token address without it.
 *
 * The guarantee is preserved rather than dropped: that module calls
 * `loadArtifact` ONCE at import, so a missing artefact fails the service at
 * BOOT rather than surfacing as a 500 on a creator's first launch — or, far
 * worse, as an address derived from bytecode that is not there. Read its header
 * before adding a second request-path caller.
 *
 * The path is resolved from `import.meta.url` rather than `process.cwd()` so it
 * works the same from `src/` under vitest, from `dist/` under node, and from
 * `scripts/` under tsx — all three sit exactly two levels below the service root.
 */

export type ArtifactName = 'AccountFactory' | 'SmartAccount' | 'SessionKeyLib' | 'SovereignToken' | 'TokenFactory';

export interface ContractArtifact {
  readonly contractName: string;
  readonly sourceName: string;
  readonly suite: string;
  readonly solcVersion: string;
  readonly evmVersion: string;
  readonly optimizer: { readonly enabled: boolean; readonly runs: number };
  /** sha256 over the compilation input. `artifacts.test.ts` re-derives it. */
  readonly sourceHash: Hex;
  readonly abi: Abi;
  /** Creation code, ready for a deployment transaction. */
  readonly bytecode: Hex;
  /** Runtime code, i.e. what `eth_getCode` returns once deployed. */
  readonly deployedBytecode: Hex;
}

export class MissingArtifactError extends Error {
  constructor(name: string, cause: unknown) {
    super(
      `No compiled artefact for ${name}. Run \`pnpm --filter @intafaced/svc-protocol contracts:build\`. ` +
        `Artefacts are committed under contracts/out/ so tests and deploys do not each run a compiler.`,
      { cause },
    );
    this.name = 'MissingArtifactError';
  }
}

export function loadArtifact(name: ArtifactName): ContractArtifact {
  const url = new URL(`../../contracts/out/${name}.json`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, 'utf8')) as ContractArtifact;
  } catch (err) {
    throw new MissingArtifactError(name, err);
  }
}
