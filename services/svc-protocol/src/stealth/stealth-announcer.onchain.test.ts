/**
 * S-L3 residual: ERC-5564 scheme-1 scan of live StealthAnnouncer logs.
 * Skips without anvil; CI with REQUIRE_EVM_CHAIN=1 must run this.
 *
 * Does not call evm_increaseTime — this suite shares one anvil.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { parseEventLogs, type Address, type Abi, type Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { generateStealthAddress, publicKeyFromPrivate, scanAnnouncements, stealthMetaAddress, type StealthAnnouncement } from './scan.js';

const spend = `0x${'11'.repeat(32)}` as Hex;
const view = `0x${'22'.repeat(32)}` as Hex;
const eph = `0x${'33'.repeat(32)}` as Hex;
const strangerView = `0x${'44'.repeat(32)}` as Hex;

const devChainMod = await (async () => {
  try {
    return await import('../../scripts/dev-chain.js');
  } catch {
    return null;
  }
})();

const chainUp = devChainMod ? await devChainMod.devChainReachable() : false;
const describeOnChain = !devChainMod || (!chainUp && !devChainMod.devChainRequired()) ? describe.skip : describe;

describeOnChain('StealthAnnouncer ECDH scan on chain (S-L3)', () => {
  if (!devChainMod) return;

  let sender: Awaited<ReturnType<typeof devChainMod.devSuiteClients>>;
  let announcer: Address;
  let announcerAbi: Abi;

  beforeAll(async () => {
    if (!chainUp && devChainMod.devChainRequired()) {
      throw new Error('REQUIRE_EVM_CHAIN=1 but no RPC at ' + devChainMod.devRpcUrl());
    }
    sender = await devChainMod.devSuiteClients(import.meta.url);
    const artifact = loadArtifact('StealthAnnouncer');
    announcerAbi = artifact.abi;
    const tx = await sender.walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      account: sender.walletClient.account!,
      chain: sender.walletClient.chain,
    });
    const receipt = await sender.publicClient.waitForTransactionReceipt({ hash: tx });
    if (!receipt.contractAddress) throw new Error('StealthAnnouncer deploy produced no address');
    announcer = receipt.contractAddress;
  });

  it('recipient viewing key finds the announced stealth address; a stranger does not', async () => {
    const generated = generateStealthAddress(stealthMetaAddress(publicKeyFromPrivate(spend), publicKeyFromPrivate(view)), eph);
    const hash = await sender.walletClient.writeContract({
      address: announcer,
      abi: announcerAbi,
      functionName: 'announce',
      args: [generated.schemeId, generated.stealthAddress, generated.ephemeralPubKey, generated.metadata],
      account: sender.walletClient.account!,
      chain: sender.walletClient.chain,
    });
    const receipt = await sender.publicClient.waitForTransactionReceipt({ hash });
    const logs = parseEventLogs({ abi: announcerAbi, logs: receipt.logs, eventName: 'Announcement' });
    expect(logs).toHaveLength(1);
    const logged = logs[0]!.args as {
      schemeId: bigint;
      stealthAddress: Address;
      ephemeralPubKey: Hex;
      metadata: Hex;
    };
    const announcement: StealthAnnouncement = {
      schemeId: logged.schemeId,
      stealthAddress: logged.stealthAddress,
      ephemeralPubKey: logged.ephemeralPubKey,
      metadata: logged.metadata,
    };
    expect(scanAnnouncements([announcement], view, publicKeyFromPrivate(spend)).map((hit) => hit.stealthAddress)).toEqual([
      generated.stealthAddress,
    ]);
    expect(scanAnnouncements([announcement], strangerView, publicKeyFromPrivate(spend))).toEqual([]);
  });
});
