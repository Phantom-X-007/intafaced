import { BankError, type BankErrorCode } from './errors.js';

const OWNER_LIST_CAP = 200;

function assertOwnerListLimit(limit: number | undefined, code: BankErrorCode, name: string): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new BankError(`${name} page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).`, code);
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new BankError(`${name} page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).`, code);
  }
  return Math.min(OWNER_LIST_CAP, n);
}

/** spaces.list / overview page size. Omit used to dump every live space. */
export function assertSpacesListLimit(limit: number | undefined): number {
  return assertOwnerListLimit(limit, 'bank.spaces_list_limit_unset', 'spaces.list');
}

/** earn.positions page size. Omit used to dump every active position. */
export function assertEarnPositionsListLimit(limit: number | undefined): number {
  return assertOwnerListLimit(limit, 'bank.earn_positions_list_limit_unset', 'earn.positions');
}

/** loans.list page size. Omit used to dump every loan. */
export function assertLoansListLimit(limit: number | undefined): number {
  return assertOwnerListLimit(limit, 'bank.loans_list_limit_unset', 'loans.list');
}

/** cards.list page size. Omit used to dump every card. */
export function assertCardsListLimit(limit: number | undefined): number {
  return assertOwnerListLimit(limit, 'bank.cards_list_limit_unset', 'cards.list');
}

/** cards.authorizations page size. Omit used to dump every decision on a card. */
export function assertCardAuthorizationsListLimit(limit: number | undefined): number {
  return assertOwnerListLimit(limit, 'bank.card_authorizations_list_limit_unset', 'cards.authorizations');
}

/** transfers.listSchedules page size. Omit used to dump every standing order. */
export function assertSchedulesListLimit(limit: number | undefined): number {
  return assertOwnerListLimit(limit, 'bank.schedules_list_limit_unset', 'transfers.listSchedules');
}
