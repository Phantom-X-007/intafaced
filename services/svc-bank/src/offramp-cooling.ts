import { BankError } from './errors.js';

/** Owner-set offramp cooling window. Blank refuses; never default 24. */
export const BANK_OFFRAMP_COOLING_HOURS_ENV = 'BANK_OFFRAMP_COOLING_HOURS';

/**
 * Require an owner-set cooling window in hours.
 *
 * Unset / blank / non-integer / negative → `bank.offramp_cooling_unset`.
 * Zero is a real owner choice (no wait). This does not invent dest-elapsed
 * policy when the dest row's last-changed clock is not being read.
 */
export function requireOfframpCoolingHours(raw: string | undefined): number {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    throw new BankError(
      `${BANK_OFFRAMP_COOLING_HOURS_ENV} is unset — offramp refuses rather than inventing cooling hours`,
      'bank.offramp_cooling_unset',
    );
  }
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new BankError(
      `${BANK_OFFRAMP_COOLING_HOURS_ENV} must be a non-negative integer hour count, got '${trimmed}'`,
      'bank.offramp_cooling_unset',
    );
  }
  return Number.parseInt(trimmed, 10);
}
