/**
 * S-F1 RankAttestation on-chain: permissionless attest/revoke, zero PII, issuer-only revoke.
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { keccak256, parseEventLogs, stringToHex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { subjectCommitment } from './commitment.js';

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

const SCHEMA = keccak256(stringToHex('intafaced.rank.v1'));
const COMMITMENT = subjectCommitment(keccak256(stringToHex('holder-chosen-salt')));

describeOnChain('RankAttestation on chain (S-F1)', () => {
  if (!devChainMod) return;

  let issuer: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let other: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let registry: Address;
  let abi: Abi;

  async function write(client: typeof issuer, fn: () => Promise<`0x${string}`>) {
    const hash = await fn();
    return client.publicClient.waitForTransactionReceipt({ hash });
  }

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    issuer = await devChainMod.devSuiteClients(import.meta.url);
    other = await devChainMod.devSuiteClients(`${import.meta.url}#other`);

    const artefact = loadArtifact('RankAttestation');
    abi = artefact.abi;
    const tx = await issuer.walletClient.deployContract({
      abi: artefact.abi,
      bytecode: artefact.bytecode,
      account: issuer.walletClient.account!,
      chain: issuer.walletClient.chain,
    });
    registry = (await issuer.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
  }, 120_000);

  it('attests a commitment with no identity fields; a second issuer may attest the same subject', async () => {
    const block = await issuer.publicClient.getBlock();
    const expiresAt = block.timestamp + 86_400n;

    const receipt = await write(issuer, () =>
      issuer.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'attest',
        args: [COMMITMENT, 7n, expiresAt, SCHEMA],
        account: issuer.walletClient.account!,
        chain: issuer.walletClient.chain,
      }),
    );
    const attested = parseEventLogs({ abi, logs: receipt.logs, eventName: 'Attested' });
    expect(attested).toHaveLength(1);
    const args = attested[0]!.args as {
      commitment: `0x${string}`;
      issuer: Address;
      rank: bigint;
      expiresAt: bigint;
      schemaId: `0x${string}`;
    };
    expect(args.commitment).toBe(COMMITMENT);
    expect(args.issuer.toLowerCase()).toBe(issuer.deployer.toLowerCase());
    expect(args.rank).toBe(7n);
    expect(args.expiresAt).toBe(expiresAt);
    expect(args.schemaId).toBe(SCHEMA);

    const stored = (await issuer.publicClient.readContract({
      address: registry,
      abi,
      functionName: 'attestations',
      args: [COMMITMENT, issuer.deployer],
    })) as readonly [bigint, bigint, bigint, `0x${string}`];
    expect(stored[0]).toBe(7n);
    expect(stored[2]).toBe(expiresAt);
    expect(stored[3]).toBe(SCHEMA);

    await write(other, () =>
      other.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'attest',
        args: [COMMITMENT, 3n, expiresAt, SCHEMA],
        account: other.walletClient.account!,
        chain: other.walletClient.chain,
      }),
    );
    const otherStored = (await issuer.publicClient.readContract({
      address: registry,
      abi,
      functionName: 'attestations',
      args: [COMMITMENT, other.deployer],
    })) as readonly [bigint, bigint, bigint, `0x${string}`];
    expect(otherStored[0]).toBe(3n);
  });

  it('reverts zero commitment, past expiry, and rank above the cap', async () => {
    const block = await issuer.publicClient.getBlock();
    const future = block.timestamp + 86_400n;
    const zero = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

    await expect(
      issuer.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'attest',
        args: [zero, 1n, future, SCHEMA],
        account: issuer.walletClient.account!,
        chain: issuer.walletClient.chain,
      }),
    ).rejects.toThrow();

    await expect(
      issuer.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'attest',
        args: [COMMITMENT, 1n, 1n, SCHEMA],
        account: issuer.walletClient.account!,
        chain: issuer.walletClient.chain,
      }),
    ).rejects.toThrow();

    await expect(
      issuer.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'attest',
        args: [COMMITMENT, 1_000_001n, future, SCHEMA],
        account: issuer.walletClient.account!,
        chain: issuer.walletClient.chain,
      }),
    ).rejects.toThrow();
  });

  it('only the issuer can revoke their own attestation; another issuer is left intact', async () => {
    const solo = subjectCommitment(keccak256(stringToHex('issuer-only-salt')));
    const block = await issuer.publicClient.getBlock();
    const expiresAt = block.timestamp + 86_400n;
    await write(issuer, () =>
      issuer.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'attest',
        args: [solo, 9n, expiresAt, SCHEMA],
        account: issuer.walletClient.account!,
        chain: issuer.walletClient.chain,
      }),
    );

    await expect(
      other.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'revoke',
        args: [solo],
        account: other.walletClient.account!,
        chain: other.walletClient.chain,
      }),
    ).rejects.toThrow();

    await write(issuer, () =>
      issuer.walletClient.writeContract({
        address: registry,
        abi,
        functionName: 'revoke',
        args: [COMMITMENT],
        account: issuer.walletClient.account!,
        chain: issuer.walletClient.chain,
      }),
    );
    const issuerCleared = (await issuer.publicClient.readContract({
      address: registry,
      abi,
      functionName: 'attestations',
      args: [COMMITMENT, issuer.deployer],
    })) as readonly [bigint, bigint, bigint, `0x${string}`];
    expect(issuerCleared[1]).toBe(0n);

    const otherKept = (await issuer.publicClient.readContract({
      address: registry,
      abi,
      functionName: 'attestations',
      args: [COMMITMENT, other.deployer],
    })) as readonly [bigint, bigint, bigint, `0x${string}`];
    expect(otherKept[0]).toBe(3n);
  });
});
