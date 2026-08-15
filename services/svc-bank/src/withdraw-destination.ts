import type { Sql } from 'postgres';
import { BankError } from './errors.js';

/**
 * User withdraw destination — the ref a later offramp must already have
 * BEFORE `withdrawHold`.
 *
 * Shape is IBAN / IFSC / EVM. This file does not invent a PSP and does not
 * live-wire a bank rail. Value still leaves through ledger-client recipes
 * after this ref is loaded.
 */

export const WITHDRAW_DESTINATION_KINDS = ['crypto', 'bank'] as const;
export type WithdrawDestinationKind = (typeof WITHDRAW_DESTINATION_KINDS)[number];

export type WithdrawDestination = { kind: WithdrawDestinationKind; ref: string };

export type UserWithdrawDestinations = {
  persist(input: { userId: string; kind: string; ref: string }): Promise<WithdrawDestination>;
  require(input: { userId: string; kind: string }): Promise<WithdrawDestination>;
};

/** EVM address: 0x + 40 hex digits. Checksum optional (structural only). */
export function isEvmAddressRef(ref: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(ref.trim());
}

/**
 * IBAN structural check: country + check digits + BBAN, length 15–34, mod-97 = 1.
 * Spaces ignored. Does not prove the account exists or is reachable.
 */
export function isIbanRef(ref: string): boolean {
  const compact = ref.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let expanded = '';
  for (const ch of rearranged) {
    if (ch >= 'A' && ch <= 'Z') expanded += String(ch.charCodeAt(0) - 55);
    else expanded += ch;
  }
  let remainder = 0;
  for (const d of expanded) {
    remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/**
 * IFSC structural check (India): 4 letters + 0 + 6 alphanumeric = 11 chars.
 * Does not prove the bank branch exists or a partner rail is live.
 */
export function isIfscRef(ref: string): boolean {
  const compact = ref.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(compact);
}

export function isBankDestinationRef(ref: string): boolean {
  return isIbanRef(ref) || isIfscRef(ref);
}

export function destKindForRamp(rampKind: 'crypto' | 'fiat'): WithdrawDestinationKind {
  return rampKind === 'fiat' ? 'bank' : 'crypto';
}

function asKind(kind: string): WithdrawDestinationKind {
  const trimmed = kind.trim();
  if (trimmed === 'crypto' || trimmed === 'bank') return trimmed;
  throw new BankError(
    `Withdraw destination kind must be crypto (EVM) or bank (IBAN/IFSC), got '${trimmed}'`,
    'bank.ramp_invalid_destination',
  );
}

/** Assert kind+shape. Does not register or enable any rail. */
export function assertPersistableWithdrawDestination(destination: { kind: string; ref: string }): WithdrawDestination {
  const kind = asKind(destination.kind);
  const ref = destination.ref?.trim() ?? '';
  if (!ref) {
    throw new BankError('Withdraw destination requires a non-empty ref', 'bank.ramp_invalid_destination');
  }
  if (kind === 'crypto') {
    if (!isEvmAddressRef(ref)) {
      throw new BankError(
        `Crypto withdraw dest must be a 20-byte EVM address (0x + 40 hex), got '${ref.slice(0, 24)}${ref.length > 24 ? '…' : ''}'`,
        'bank.ramp_invalid_destination',
      );
    }
    return { kind, ref };
  }
  if (!isBankDestinationRef(ref)) {
    throw new BankError(
      'Bank withdraw dest must be a structural IBAN (mod-97) or IFSC (11-char India scheme).',
      'bank.ramp_invalid_destination',
    );
  }
  return { kind, ref };
}

/**
 * Router-test default: assert on persist, never invent a stored ref.
 * A later withdraw without a dest refuses closed — no invented ref.
 */
export function assertOnlyWithdrawDestinations(): UserWithdrawDestinations {
  return {
    async persist(input) {
      return assertPersistableWithdrawDestination(input);
    },
    async require(input) {
      throw new BankError(
        `User ${input.userId} has no persisted withdraw destination for kind ${input.kind}`,
        'bank.withdraw_destination_missing',
      );
    },
  };
}

/** In-memory store for tests. Persist stores; require refuses closed if none stored. */
export function memoryWithdrawDestinations(): UserWithdrawDestinations {
  const rows = new Map<string, WithdrawDestination>();
  const key = (userId: string, kind: string) => `${userId}:${kind}`;
  return {
    async persist(input) {
      const dest = assertPersistableWithdrawDestination(input);
      rows.set(key(input.userId, dest.kind), dest);
      return dest;
    },
    async require(input) {
      const kind = asKind(input.kind);
      const dest = rows.get(key(input.userId, kind));
      if (!dest) {
        throw new BankError(
          `User ${input.userId} has no persisted withdraw destination for kind ${kind}`,
          'bank.withdraw_destination_missing',
        );
      }
      return dest;
    },
  };
}

export class UserWithdrawDestinationStore implements UserWithdrawDestinations {
  constructor(private readonly sql: Sql) {}

  async persist(input: { userId: string; kind: string; ref: string }): Promise<WithdrawDestination> {
    const dest = assertPersistableWithdrawDestination(input);
    await this.sql`
      INSERT INTO bank.user_withdraw_destinations (user_id, kind, ref)
      VALUES (${input.userId}, ${dest.kind}, ${dest.ref})
      ON CONFLICT (user_id, kind)
      DO UPDATE SET ref = excluded.ref, updated_at = now()
    `;
    return dest;
  }

  async require(input: { userId: string; kind: string }): Promise<WithdrawDestination> {
    const kind = asKind(input.kind);
    const rows = await this.sql<Array<{ kind: string; ref: string }>>`
      SELECT kind, ref FROM bank.user_withdraw_destinations
       WHERE user_id = ${input.userId} AND kind = ${kind}
    `;
    const row = rows[0];
    if (!row) {
      throw new BankError(
        `User ${input.userId} has no persisted withdraw destination for kind ${kind}`,
        'bank.withdraw_destination_missing',
      );
    }
    return { kind, ref: row.ref };
  }
}
