/**
 * PoolFactory on a real disposable chain (protocol.amm).
 *
 * Proves: deploy → predictPoolAddress == createPool landing address + runtime code.
 * Skips when no anvil unless REQUIRE_EVM_CHAIN=1 (CI).
 * Skips collect when local install cannot resolve viem (incomplete laptop node_modules).
 *
 * Uses anvil account index 3 so it does not race deploy-dev (0) or other
 * on-chain suites (1–2) on shared nonces.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

type Address = `0x${string}`;

const TOKEN_A: Address = '0x00000000000000000000000000000000000000a1';
const TOKEN_B: Address = '0x00000000000000000000000000000000000000b1';
const FEE_BPS = 30;

function lower(a: string): string {
  return a.toLowerCase();
}

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain =
  !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('PoolFactory onchain (protocol.amm)', () => {
  if (!devChainMod) return;

  const clients = devChainMod.devChainClients(devChainMod.devRpcUrl(), devChainMod.DEV_CHAIN_ID, 3);
  let factory: Address;

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    await devChainMod.assertDisposableChain(clients.publicClient, devChainMod.DEV_CHAIN_ID);
    const deployed = await devChainMod.deployPoolFactory(clients);
    factory = deployed.factory;
  });

  it('predictPoolAddress matches createPool and lands code', async () => {
    const { publicClient, walletClient } = clients;
    const abi = loadArtifact('PoolFactory').abi;
    const predicted = (await publicClient.readContract({
      address: factory,
      abi,
      functionName: 'predictPoolAddress',
      args: [TOKEN_A, TOKEN_B, FEE_BPS],
    })) as Address;

    const existing = await publicClient.getCode({ address: predicted });
    if (!existing || existing === '0x') {
      const hash = await walletClient.writeContract({
        address: factory,
        abi,
        functionName: 'createPool',
        args: [TOKEN_A, TOKEN_B, FEE_BPS],
        account: walletClient.account!,
        chain: walletClient.chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe('success');
    }

    const registered = (await publicClient.readContract({
      address: factory,
      abi,
      functionName: 'getPool',
      args: [TOKEN_A, TOKEN_B, FEE_BPS],
    })) as Address;
    expect(lower(registered)).toBe(lower(predicted));
    const code = await publicClient.getCode({ address: predicted });
    expect(code && code !== '0x').toBe(true);
  });

  it('second createPool reverts PoolExists', async () => {
    const { publicClient, walletClient } = clients;
    const abi = loadArtifact('PoolFactory').abi;
    const predicted = (await publicClient.readContract({
      address: factory,
      abi,
      functionName: 'predictPoolAddress',
      args: [TOKEN_A, TOKEN_B, FEE_BPS],
    })) as Address;
    const code = await publicClient.getCode({ address: predicted });
    if (!code || code === '0x') {
      await walletClient.writeContract({
        address: factory,
        abi,
        functionName: 'createPool',
        args: [TOKEN_A, TOKEN_B, FEE_BPS],
        account: walletClient.account!,
        chain: walletClient.chain,
      });
    }

    await expect(
      walletClient.writeContract({
        address: factory,
        abi,
        functionName: 'createPool',
        args: [TOKEN_A, TOKEN_B, FEE_BPS],
        account: walletClient.account!,
        chain: walletClient.chain,
      }),
    ).rejects.toThrow();
  });
});
