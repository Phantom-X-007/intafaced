import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { BankError } from '../errors.js';

/**
 * Daily interest is sized from the ledger earn stake pot, never from the
 * `earn_positions.principal` column as a money source.
 *
 * The table is still the eligibility record. If it disagrees with the pot,
 * refuse — a stale principal must not invent a day's yield.
 */
export function stakePrincipalForAccrual(positionId: string, tablePrincipal: Amount, ledgerPrincipal: Amount): Amount {
  if (ledgerPrincipal !== tablePrincipal) {
    throw new BankError(
      `Earn position ${positionId} table principal ${formatAmount(tablePrincipal)} disagrees with ledger stake ${formatAmount(ledgerPrincipal)} — refusing to invent interest`,
      'bank.earn_principal_mismatch',
    );
  }
  return ledgerPrincipal;
}
