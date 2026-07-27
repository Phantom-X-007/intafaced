import { hashMessage, recoverAddress, getAddress as toChecksum } from 'viem';
import type { Address, Hex } from 'viem';
import { computeAccountAddress, DEFAULT_USER_SALT } from './address.js';
import { withAuthoritySpan } from '../tracing.js';

/**
 * ACCOUNT REGISTRY — address ↔ user id. A read model, not custody.
 *
 * The registry answers one question: "which smart account belongs to this
 * INTAFACED user?". That is a convenience for the product surfaces, and it is
 * all it is. Deleting this table would cost users their account list in the UI
 * and cost them nothing else — their funds are at an address derived from their
 * own key, on a chain we do not run, reachable with no help from us.
 *
 * That property is worth stating precisely because it is what "non-custodial"
 * has to mean in practice: not that we promise not to touch the funds, but that
 * the entire platform could disappear and the user would lose nothing but a
 * convenience.
 */

export interface AccountRecord {
  readonly id: string;
  readonly userId: string;
  readonly chainId: number;
  readonly address: Address;
  readonly owner: Address;
  readonly userSalt: Hex;
  readonly deployed: boolean;
  /** When the user proved control of the owner key. Null = unverified claim. */
  readonly verifiedAt: Date | null;
}

export interface AccountUpsert {
  userId: string;
  chainId: number;
  address: Address;
  owner: Address;
  userSalt: Hex;
  deployed: boolean;
  verifiedAt: Date | null;
}

/**
 * Storage seam. `PostgresAccountStore` is the production implementation;
 * `MemoryAccountStore` is what the tests use, so registry logic is provable
 * without a database.
 */
export interface AccountStore {
  upsert(record: AccountUpsert): Promise<AccountRecord>;
  findByUser(userId: string, chainId: number): Promise<AccountRecord[]>;
  findByAddress(chainId: number, address: Address): Promise<AccountRecord | null>;
  markDeployed(chainId: number, address: Address, at: Date): Promise<void>;
}

export class MemoryAccountStore implements AccountStore {
  readonly rows = new Map<string, AccountRecord>();
  #seq = 0;

  #key(chainId: number, address: Address): string {
    return `${chainId}:${address.toLowerCase()}`;
  }

  async upsert(record: AccountUpsert): Promise<AccountRecord> {
    const key = this.#key(record.chainId, record.address);
    const existing = this.rows.get(key);
    const next: AccountRecord = {
      id: existing?.id ?? `mem-${++this.#seq}`,
      userId: record.userId,
      chainId: record.chainId,
      address: toChecksum(record.address),
      owner: toChecksum(record.owner),
      userSalt: record.userSalt,
      deployed: record.deployed || (existing?.deployed ?? false),
      verifiedAt: record.verifiedAt ?? existing?.verifiedAt ?? null,
    };
    this.rows.set(key, next);
    return next;
  }

  async findByUser(userId: string, chainId: number): Promise<AccountRecord[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId && r.chainId === chainId);
  }

  async findByAddress(chainId: number, address: Address): Promise<AccountRecord | null> {
    return this.rows.get(this.#key(chainId, address)) ?? null;
  }

  async markDeployed(chainId: number, address: Address, _at: Date): Promise<void> {
    const key = this.#key(chainId, address);
    const existing = this.rows.get(key);
    if (existing) this.rows.set(key, { ...existing, deployed: true });
  }
}

export type ClaimRefusalCode = 'registry.address_mismatch' | 'registry.signature_not_owner' | 'registry.already_claimed';

export class ClaimRefusedError extends Error {
  constructor(
    readonly code: ClaimRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClaimRefusedError';
  }
}

/**
 * The message a user signs to attach their account to their INTAFACED id.
 *
 * Deliberately readable, deliberately scoped to one chain and one address, and
 * deliberately containing no authorisation of any kind — signing it links a row
 * in a database and confers nothing on anybody.
 */
export function bindingMessage(args: { userId: string; chainId: number; address: Address }): string {
  return [
    'INTAFACED — link smart account',
    '',
    `account: ${args.address}`,
    `chain:   ${args.chainId}`,
    `user:    ${args.userId}`,
    '',
    'Signing this links this account to your INTAFACED profile.',
    'It grants no permission over the account and moves no funds.',
  ].join('\n');
}

export interface RegistryConfig {
  readonly chainId: number;
  readonly factory: Address;
  readonly implementation: Address;
}

export class AccountRegistry {
  constructor(
    private readonly store: AccountStore,
    private readonly config: RegistryConfig,
  ) {}

  /** The address a given owner key will have. No chain access needed. */
  predict(owner: Address, userSalt: Hex = DEFAULT_USER_SALT): Address {
    return computeAccountAddress({
      factory: this.config.factory,
      implementation: this.config.implementation,
      owner,
      userSalt,
    });
  }

  /**
   * Link an account to a user id, on proof of the owner key.
   *
   * Two independent checks, because a registry row that claims someone else's
   * address is a support incident waiting to happen:
   *   1. the address must be the CREATE2 address of the claimed owner — so a
   *      user cannot register an address they merely know about
   *   2. the owner key must have signed the binding message
   */
  async claim(args: {
    userId: string;
    owner: Address;
    userSalt?: Hex;
    address: Address;
    signature: Hex;
    deployed: boolean;
  }): Promise<AccountRecord> {
    return withAuthoritySpan(
      'registry.claim',
      { operation: 'claim', account: args.address, authority: 'owner', chainId: this.config.chainId },
      async () => {
        const userSalt = args.userSalt ?? DEFAULT_USER_SALT;
        const derived = this.predict(args.owner, userSalt);
        if (toChecksum(args.address) !== derived) {
          throw new ClaimRefusedError(
            'registry.address_mismatch',
            `${args.address} is not the account of ${args.owner} — expected ${derived}`,
          );
        }

        const message = bindingMessage({ userId: args.userId, chainId: this.config.chainId, address: derived });
        const recovered = await recoverAddress({ hash: hashMessage(message), signature: args.signature });
        if (toChecksum(recovered) !== toChecksum(args.owner)) {
          throw new ClaimRefusedError('registry.signature_not_owner', 'The binding signature does not come from the owner key');
        }

        const existing = await this.store.findByAddress(this.config.chainId, derived);
        if (existing && existing.userId !== args.userId) {
          throw new ClaimRefusedError('registry.already_claimed', 'This account is linked to another profile');
        }

        return this.store.upsert({
          userId: args.userId,
          chainId: this.config.chainId,
          address: derived,
          owner: toChecksum(args.owner),
          userSalt,
          deployed: args.deployed,
          verifiedAt: new Date(),
        });
      },
    );
  }

  async accountsOf(userId: string): Promise<AccountRecord[]> {
    return this.store.findByUser(userId, this.config.chainId);
  }

  async ownerOfRecord(address: Address): Promise<AccountRecord | null> {
    return this.store.findByAddress(this.config.chainId, address);
  }

  async recordDeployment(address: Address, at: Date = new Date()): Promise<void> {
    await this.store.markDeployed(this.config.chainId, address, at);
  }
}
