import { createPublicClient, defineChain, http } from 'viem';
import type { Address, Hex, PublicClient } from 'viem';
import { accountFactoryAbi, smartAccountAbi } from './abi.js';
import { withSpan } from '../tracing.js';

/**
 * Chain access — read-only, by construction.
 *
 * This service holds a `PublicClient` and nothing else. There is no
 * `WalletClient` here and no private key in this file, because there is no
 * transaction this service is entitled to originate on a user's account: every
 * state change on this plane is a user-signed operation that we forward to a
 * bundler (see `session/relay.ts`).
 *
 * A relayer that pays gas is a separate, optional concern and still cannot
 * originate anything — a user operation is bound to its hash, and the hash
 * covers everything except the signature.
 */

export interface ChainConfig {
  readonly chainId: number;
  readonly rpcUrl: string;
  /** ERC-4337 EntryPoint v0.7 singleton for this chain. */
  readonly entryPoint: Address;
  readonly factory: Address;
  readonly implementation: Address;
  /** ERC-4337 bundler JSON-RPC. Absent = relaying is unavailable, reads still work. */
  readonly bundlerUrl?: string;
}

export interface OnChainSession {
  readonly specHash: Hex;
  readonly validAfter: number;
  readonly validUntil: number;
  readonly spentWei: bigint;
  readonly epoch: bigint;
  readonly revoked: boolean;
}

const NO_SESSION_HASH = `0x${'00'.repeat(32)}` as Hex;

export class ProtocolChain {
  readonly client: PublicClient;

  constructor(readonly config: ChainConfig) {
    const chain = defineChain({
      id: config.chainId,
      name: `intafaced-protocol-${config.chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });
    this.client = createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient;
  }

  /** Whether an account address has code yet. A predicted address has none. */
  async isDeployed(address: Address): Promise<boolean> {
    return withSpan('chain.isDeployed', async () => {
      const code = await this.client.getCode({ address });
      return code !== undefined && code !== '0x';
    });
  }

  /** The factory's own answer, so a derivation bug in this repo cannot go unnoticed. */
  async predictAddressOnChain(owner: Address, userSalt: Hex): Promise<Address> {
    return withSpan('chain.getAddress', async () =>
      this.client.readContract({
        address: this.config.factory,
        abi: accountFactoryAbi,
        functionName: 'getAddress',
        args: [owner, userSalt],
      }),
    );
  }

  async ownerOf(account: Address): Promise<Address> {
    return withSpan('chain.owner', async () => this.client.readContract({ address: account, abi: smartAccountAbi, functionName: 'owner' }));
  }

  async sessionEpoch(account: Address): Promise<bigint> {
    return withSpan('chain.sessionEpoch', async () =>
      this.client.readContract({ address: account, abi: smartAccountAbi, functionName: 'sessionEpoch' }),
    );
  }

  /** Null when the key was never granted — not an error, just absence. */
  async sessionOf(account: Address, sessionKey: Address): Promise<OnChainSession | null> {
    return withSpan('chain.getSession', async () => {
      const record = await this.client.readContract({
        address: account,
        abi: smartAccountAbi,
        functionName: 'getSession',
        args: [sessionKey],
      });
      if (record.specHash === NO_SESSION_HASH) return null;
      return {
        specHash: record.specHash,
        validAfter: Number(record.validAfter),
        validUntil: Number(record.validUntil),
        spentWei: record.spentWei,
        epoch: record.epoch,
        revoked: record.revoked,
      };
    });
  }

  async isSessionLive(account: Address, sessionKey: Address): Promise<boolean> {
    return withSpan('chain.isSessionLive', async () =>
      this.client.readContract({
        address: account,
        abi: smartAccountAbi,
        functionName: 'isSessionLive',
        args: [sessionKey],
      }),
    );
  }
}
