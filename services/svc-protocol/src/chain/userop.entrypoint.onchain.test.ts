/**
 * S-A11 — TypeScript getUserOperationHash vs ERC-4337 v0.7 Solidity.
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Hex } from 'viem';
import { loadArtifact } from './artifacts.js';
import { encodeSignatureEnvelope, getUserOperationHash, packUserOperation, type UserOperation } from './userop.js';

const SIGNATURE = `0x${'ab'.repeat(65)}` as Hex;
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

function op(overrides: Partial<UserOperation> = {}): UserOperation {
  return {
    sender: ACCOUNT,
    nonce: 7n,
    callData: '0xdeadbeef',
    callGasLimit: 100_000n,
    verificationGasLimit: 200_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 100_000_000n,
    signature: encodeSignatureEnvelope('owner', SIGNATURE),
    ...overrides,
  };
}

describeOnChain('S-A11 userOp hash vs EntryPoint Solidity', () => {
  if (!devChainMod) return;

  let hasher: Address;
  let chainId: number;
  let clients: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  const artefact = loadArtifact('EntryPointGetUserOpHash');

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    clients = await devChainMod.devSuiteClients(import.meta.url);
    const tx = await clients.walletClient.deployContract({
      abi: artefact.abi,
      bytecode: artefact.bytecode,
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    hasher = (await clients.publicClient.waitForTransactionReceipt({ hash: tx })).contractAddress!;
    chainId = await clients.publicClient.getChainId();
  }, 60_000);

  async function onChainHash(userOp: UserOperation): Promise<Hex> {
    const packed = packUserOperation(userOp);
    return (await clients.publicClient.readContract({
      address: hasher,
      abi: artefact.abi,
      functionName: 'getUserOpHash',
      args: [
        {
          sender: packed.sender,
          nonce: packed.nonce,
          initCode: packed.initCode,
          callData: packed.callData,
          accountGasLimits: packed.accountGasLimits,
          preVerificationGas: packed.preVerificationGas,
          gasFees: packed.gasFees,
          paymasterAndData: packed.paymasterAndData,
          signature: packed.signature,
        },
      ],
    })) as Hex;
  }

  it('agrees with TypeScript for the empty factory / paymaster case', async () => {
    const userOp = op();
    const ts = getUserOperationHash({ userOp, entryPoint: hasher, chainId });
    expect(await onChainHash(userOp)).toBe(ts);
  });

  it('agrees when factory + paymaster packing is non-empty', async () => {
    const userOp = op({
      factory: '0x1111111111111111111111111111111111111111',
      factoryData: '0xc0ffee',
      paymaster: '0x2222222222222222222222222222222222222222',
      paymasterVerificationGasLimit: 30_000n,
      paymasterPostOpGasLimit: 40_000n,
      paymasterData: '0xabcd',
    });
    const ts = getUserOperationHash({ userOp, entryPoint: hasher, chainId });
    expect(await onChainHash(userOp)).toBe(ts);
  });

  it('ignores the signature on both sides', async () => {
    const a = op();
    const b = op({ signature: encodeSignatureEnvelope('session', `0x${'cd'.repeat(65)}` as Hex) });
    expect(await onChainHash(a)).toBe(await onChainHash(b));
    expect(getUserOperationHash({ userOp: a, entryPoint: hasher, chainId })).toBe(
      getUserOperationHash({ userOp: b, entryPoint: hasher, chainId }),
    );
  });
});
