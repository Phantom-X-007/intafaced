import { createPublicClient, defineChain, http } from 'viem';
import type { Address, Hex, PublicClient } from 'viem';
import { accountFactoryAbi, smartAccountAbi } from './abi.js';
import { poolAbi } from '../amm/abi.js';
import { ChainUnavailableError, classifyChainError, isZeroAddress } from './availability.js';
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

/** Reserves as the pool itself reports them. `blockTimestampLast` is the pool's own clock. */
export interface PoolReserves {
  readonly reserve0: bigint;
  readonly reserve1: bigint;
  readonly blockTimestampLast: number;
}

/** What `chainStatus` reports. Never throws — being down is an answer, not a fault. */
export interface ChainStatus {
  readonly reachable: boolean;
  /** The chain id we derive addresses for. */
  readonly configuredChainId: number;
  /** What the RPC says it is. Null when it did not answer. */
  readonly observedChainId: number | null;
  readonly blockNumber: string | null;
  /**
   * Both addresses are non-zero. A statement about configuration and nothing
   * more — it says somebody set an env var, not that anything exists.
   */
  readonly suiteConfigured: boolean;
  /**
   * VERIFIED: the factory AND the implementation hold contract code on this
   * chain, read this call.
   *
   * This used to be the same boolean as `suiteConfigured`, and that was the
   * remaining place this service could still claim something it had not
   * checked. The moment real addresses go into a compose file — which is
   * exactly what a local dev chain makes possible — "configured" and "deployed"
   * come apart: point the stack at a chain where the suite was never deployed,
   * or at a restarted anvil that lost its state, and the addresses are still
   * non-zero while nothing is there. `usable` is derived from this one, so it
   * has to be the read and not the guess.
   *
   * False whenever the chain could not be reached, because an unverifiable
   * claim is not a true one.
   */
  readonly suiteDeployed: boolean;
  readonly refusalCode: string | null;
  readonly reason: string | null;
}

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

  /**
   * Every read goes through here.
   *
   * A chain read has exactly two honest outcomes: an answer, or a typed refusal
   * naming why there was none. `classifyChainError` is what keeps the second
   * from degrading into an opaque 500 — or, worse, into a default value.
   */
  async #read<T>(what: string, span: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await withSpan(span, fn);
    } catch (err) {
      throw classifyChainError(err, what, this.config.rpcUrl);
    }
  }

  /** Whether an account address has code yet. A predicted address has none. */
  async isDeployed(address: Address): Promise<boolean> {
    return this.#read('isDeployed', 'chain.isDeployed', async () => {
      const code = await this.client.getCode({ address });
      return code !== undefined && code !== '0x';
    });
  }

  /** The factory's own answer, so a derivation bug in this repo cannot go unnoticed. */
  async predictAddressOnChain(owner: Address, userSalt: Hex): Promise<Address> {
    return this.#read('predictAddressOnChain', 'chain.getAddress', async () =>
      this.client.readContract({
        address: this.config.factory,
        abi: accountFactoryAbi,
        functionName: 'getAddress',
        args: [owner, userSalt],
      }),
    );
  }

  async ownerOf(account: Address): Promise<Address> {
    return this.#read('ownerOf', 'chain.owner', async () =>
      this.client.readContract({ address: account, abi: smartAccountAbi, functionName: 'owner' }),
    );
  }

  async sessionEpoch(account: Address): Promise<bigint> {
    return this.#read('sessionEpoch', 'chain.sessionEpoch', async () =>
      this.client.readContract({ address: account, abi: smartAccountAbi, functionName: 'sessionEpoch' }),
    );
  }

  /**
   * Null when the key was never granted — not an error, just absence.
   *
   * The distinction only holds because `#read` converts a call against an
   * address with no code into `protocol.contract_not_deployed` instead of
   * letting it surface as a decode failure. Null here means the account exists
   * and the owner granted this key nothing. It never means "we could not ask".
   */
  async sessionOf(account: Address, sessionKey: Address): Promise<OnChainSession | null> {
    return this.#read('sessionOf', 'chain.getSession', async () => {
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
    return this.#read('isSessionLive', 'chain.isSessionLive', async () =>
      this.client.readContract({
        address: account,
        abi: smartAccountAbi,
        functionName: 'isSessionLive',
        args: [sessionKey],
      }),
    );
  }

  /**
   * Live reserves for a constant-product pool.
   *
   * `amm.quoteExactIn` took reserves as an input and nothing in the repo ever
   * supplied them, which made a correct AMM implementation into a calculator
   * with no inputs — `getReserves` was in the ABI and called from nowhere. This
   * is the read that closes that loop. Today it refuses, because there is no
   * chain; it refuses with `protocol.contract_not_deployed` or
   * `protocol.chain_unreachable`, and never with a zero reserve.
   *
   * A zero reserve would be the worst possible answer: `getAmountOut` treats
   * empty reserves as `amm.no_liquidity`, so fabricated zeros would surface to a
   * user as the confident claim "this pool has no liquidity" about a pool nobody
   * has looked at.
   */
  async poolReserves(pool: Address): Promise<PoolReserves> {
    return this.#read('poolReserves', 'chain.getReserves', async () => {
      const [reserve0, reserve1, blockTimestampLast] = await this.client.readContract({
        address: pool,
        abi: poolAbi,
        functionName: 'getReserves',
      });
      return { reserve0, reserve1, blockTimestampLast: Number(blockTimestampLast) };
    });
  }

  /** Which token is `reserve0`. Needed to orient a quote; a pool sorts its pair. */
  async poolToken0(pool: Address): Promise<Address> {
    return this.#read('poolToken0', 'chain.token0', async () =>
      this.client.readContract({ address: pool, abi: poolAbi, functionName: 'token0' }),
    );
  }

  async poolToken1(pool: Address): Promise<Address> {
    return this.#read('poolToken1', 'chain.token1', async () =>
      this.client.readContract({ address: pool, abi: poolAbi, functionName: 'token1' }),
    );
  }

  async poolFeeBps(pool: Address): Promise<number> {
    return this.#read('poolFeeBps', 'chain.feeBps', async () =>
      this.client.readContract({ address: pool, abi: poolAbi, functionName: 'feeBps' }).then(Number),
    );
  }

  /**
   * Assert the RPC is the chain we derive addresses for.
   *
   * A CREATE2 address is only meaningful on the chain its factory is deployed
   * to. If `PROTOCOL_CHAIN_ID` says 31337 while the RPC is answering for
   * mainnet, every address this service predicts is wrong in a way no amount of
   * correct arithmetic can catch — so it is checked against the endpoint rather
   * than trusted from config.
   */
  async assertChainId(): Promise<number> {
    const observed = await this.#read('assertChainId', 'chain.chainId', async () => this.client.getChainId());
    if (observed !== this.config.chainId) {
      throw new ChainUnavailableError(
        'protocol.chain_id_mismatch',
        `The RPC at ${this.config.rpcUrl} is chain ${observed}, but this service derives addresses for chain ` +
          `${this.config.chainId}. Refusing: an address predicted for the wrong chain is an address a user could fund and never reach.`,
      );
    }
    return observed;
  }

  /**
   * The honest self-report. Answers "is any of this real yet?" without throwing,
   * because a product surface needs to render the refusal, not catch it.
   */
  async status(): Promise<ChainStatus> {
    const suiteConfigured = !isZeroAddress(this.config.factory) && !isZeroAddress(this.config.implementation);

    try {
      const observedChainId = await this.assertChainId();
      const blockNumber = await this.#read('blockNumber', 'chain.blockNumber', async () => this.client.getBlockNumber());
      // Two `eth_getCode` calls, only when the addresses are worth asking
      // about. This is the difference between "somebody set an env var" and
      // "the contracts are there", and it is cheap enough to do on every probe.
      const suiteDeployed =
        suiteConfigured && (await this.isDeployed(this.config.factory)) && (await this.isDeployed(this.config.implementation));
      return {
        reachable: true,
        configuredChainId: this.config.chainId,
        observedChainId,
        blockNumber: blockNumber.toString(),
        suiteConfigured,
        suiteDeployed,
        refusalCode: null,
        reason: null,
      };
    } catch (err) {
      const refusal = err instanceof ChainUnavailableError ? err : classifyChainError(err, 'status', this.config.rpcUrl);
      return {
        reachable: false,
        configuredChainId: this.config.chainId,
        // Null even on a chain-id mismatch: the endpoint answered, but not for a
        // chain this service can serve, so there is no id here worth reporting
        // as ours. The observed id is named in `reason`.
        observedChainId: null,
        blockNumber: null,
        suiteConfigured,
        // Nobody looked, so nothing is deployed as far as this answer goes.
        suiteDeployed: false,
        refusalCode: refusal.code,
        reason: refusal.message,
      };
    }
  }
}
