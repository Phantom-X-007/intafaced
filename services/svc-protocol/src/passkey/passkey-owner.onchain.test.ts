import { beforeAll, describe, expect, it } from 'vitest';
import { encodeDeployData, keccak256, type Address, type Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { devChainReachable, devChainRequired, devRpcUrl, devSuiteClients, type DevChainClients } from '../../scripts/dev-chain.js';
import {
  buildAuthData,
  buildGetClientDataJSON,
  encodePasskeySignature,
  makeP256KeyPair,
  signWebAuthnAssertion,
} from './webauthn-bridge.js';

/**
 * S-A9 Done bar: a passkey signature verified ON-CHAIN, cross-checked against
 * the same WebAuthn assertion shape svc-identity already produces.
 *
 * Needs RIP-7212 at 0x100 (Base / recent anvil). If the precompile is absent,
 * the suite skips locally and fails hard when REQUIRE_EVM_CHAIN=1 — same bargain
 * as CREATE2: CI must not silently lose the proof.
 */

const rpcUrl = devRpcUrl();
const reachable = await devChainReachable(rpcUrl);

if (!reachable && devChainRequired()) {
  throw new Error(
    `REQUIRE_EVM_CHAIN=1 but no EVM RPC at ${rpcUrl}. PasskeyOwner proof needs a chain (and RIP-7212). ` +
      `Start: docker compose up -d evm`,
  );
}

const ERC1271_MAGIC = '0x1626ba7e';

describe.skipIf(!reachable)('PasskeyOwner on chain (S-A9)', () => {
  let clients: DevChainClients;
  let owner: Address;
  let hasPrecompile: boolean;
  let qx: Hex;
  let qy: Hex;
  let privateKey: ReturnType<typeof makeP256KeyPair>['privateKey'];

  beforeAll(async () => {
    clients = await devSuiteClients(import.meta.url, rpcUrl);
    const keys = makeP256KeyPair();
    qx = keys.qx;
    qy = keys.qy;
    privateKey = keys.privateKey;

    const artifact = loadArtifact('PasskeyOwner');
    const deployData = encodeDeployData({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [qx, qy],
    });
    const hash = await clients.wallet.sendTransaction({ data: deployData });
    const receipt = await clients.public.waitForTransactionReceipt({ hash });
    owner = receipt.contractAddress!;
    if (!owner) throw new Error('PasskeyOwner deploy produced no address');

    hasPrecompile = (await clients.public.readContract({
      address: owner,
      abi: artifact.abi,
      functionName: 'precompilePresent',
    })) as boolean;

    if (!hasPrecompile && devChainRequired()) {
      throw new Error(
        'REQUIRE_EVM_CHAIN=1 but RIP-7212 P256VERIFY (0x100) is not present on this anvil. ' +
          'Upgrade the foundry image or enable the precompile — without it PasskeyOwner cannot prove on-chain.',
      );
    }
  }, 60_000);

  it('reports whether RIP-7212 is present', () => {
    expect(typeof hasPrecompile).toBe('boolean');
  });

  it.skipIf(!reachable)('accepts a WebAuthn assertion bound to the account digest', async function () {
    if (!hasPrecompile) {
      // Local anvil without precompile: skip, don't fake green.
      return;
    }
    const artifact = loadArtifact('PasskeyOwner');
    const digest = keccak256('0xuser-op-hash-fixture');
    const clientDataJSON = buildGetClientDataJSON({ challengeHash: digest, origin: 'http://localhost:3000' });
    const authenticatorData = buildAuthData({ rpID: 'localhost' });
    const { r, s } = signWebAuthnAssertion({ privateKey, authenticatorData, clientDataJSON });
    const signature = encodePasskeySignature({ authenticatorData, clientDataJSON, r, s });

    const magic = (await clients.public.readContract({
      address: owner,
      abi: artifact.abi,
      functionName: 'isValidSignature',
      args: [digest, signature],
    })) as Hex;

    expect(magic.toLowerCase()).toBe(ERC1271_MAGIC);
  });

  it.skipIf(!reachable)('refuses when the challenge is a different digest', async function () {
    if (!hasPrecompile) return;
    const artifact = loadArtifact('PasskeyOwner');
    const digest = keccak256('0xexpected');
    const wrong = keccak256('0xother');
    const clientDataJSON = buildGetClientDataJSON({ challengeHash: wrong, origin: 'http://localhost:3000' });
    const authenticatorData = buildAuthData({ rpID: 'localhost' });
    const { r, s } = signWebAuthnAssertion({ privateKey, authenticatorData, clientDataJSON });
    const signature = encodePasskeySignature({ authenticatorData, clientDataJSON, r, s });

    const magic = (await clients.public.readContract({
      address: owner,
      abi: artifact.abi,
      functionName: 'isValidSignature',
      args: [digest, signature],
    })) as Hex;

    expect(magic.toLowerCase()).not.toBe(ERC1271_MAGIC);
  });

  it('stores the public key as immutables', async () => {
    const artifact = loadArtifact('PasskeyOwner');
    const onchainQx = (await clients.public.readContract({
      address: owner,
      abi: artifact.abi,
      functionName: 'qx',
    })) as Hex;
    const onchainQy = (await clients.public.readContract({
      address: owner,
      abi: artifact.abi,
      functionName: 'qy',
    })) as Hex;
    expect(onchainQx.toLowerCase()).toBe(qx.toLowerCase());
    expect(onchainQy.toLowerCase()).toBe(qy.toLowerCase());
  });
});
