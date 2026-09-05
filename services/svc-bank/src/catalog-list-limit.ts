import { BankError, type BankErrorCode } from './errors.js';

const CATALOG_CAP = 200;

function assertCatalogListLimit(limit: number | undefined, code: BankErrorCode, name: string): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new BankError(`${name} page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).`, code);
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new BankError(`${name} page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).`, code);
  }
  return Math.min(CATALOG_CAP, n);
}

/** earn.pools catalog page size. Omit used to dump every open pool. */
export function assertEarnPoolsListLimit(limit: number | undefined): number {
  return assertCatalogListLimit(limit, 'bank.earn_pools_list_limit_unset', 'earn.pools');
}

/** loans.products catalog page size. Omit used to dump every open product. */
export function assertLoanProductsListLimit(limit: number | undefined): number {
  return assertCatalogListLimit(limit, 'bank.loan_products_list_limit_unset', 'loans.products');
}
