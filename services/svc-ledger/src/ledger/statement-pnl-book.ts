/**
 * B5 (PTX-M14-R02). Statement PnL against THIS book's posted balances.
 * History and cash are not lots, marks, NAV, or cost basis. Missing those
 * facts is a named refuse, never 0. Mill compose is not recut. svc-trade is not.
 */

import type { Balance } from '@intafaced/ledger-client';
import { z } from 'zod';
import {
  STATEMENT_LOTS_MISSING,
  STATEMENT_MARK_MISSING,
  STATEMENT_NAV_INPUTS_MISSING,
  statementPnlFromThisBook,
  statementPnlInputSchema,
  type StatementPnlOwner,
  type StatementPnlResult,
} from './statement-pnl.js';

export const STATEMENT_COST_BASIS_INVENTED = 'ledger.statement.cost_basis_invented' as const;

export const statementPnlBookInputSchema = statementPnlInputSchema.extend({
  inventFifoFromHistory: z.boolean().optional(),
  lotsFromHistory: z.boolean().optional(),
  costBasis: z.string().nullable().optional(),
});

const MISSING: StatementPnlResult['codes'] = [
  STATEMENT_LOTS_MISSING,
  STATEMENT_MARK_MISSING,
  STATEMENT_NAV_INPUTS_MISSING,
];

function refuseMissing(owner: StatementPnlOwner): StatementPnlResult {
  return {
    ...owner,
    status: 'refused',
    codes: MISSING,
    realized: null,
    unrealized: null,
    nav: null,
  };
}

/** Caller FIFO / cost basis is not lots on this book. */
export function refuseInventedCostBasis(input: {
  readonly inventFifoFromHistory?: boolean;
  readonly lotsFromHistory?: boolean;
  readonly costBasis?: string | null;
}): StatementPnlResult | null {
  if (input.inventFifoFromHistory === true || input.lotsFromHistory === true) {
    return refuseMissing({
      ownerType: 'user',
      ownerId: 'invented',
      reportingAssetId: 'unset',
    });
  }
  if (input.costBasis !== undefined && input.costBasis !== null) {
    return refuseMissing({
      ownerType: 'user',
      ownerId: 'invented',
      reportingAssetId: 'unset',
    });
  }
  return null;
}

/** Posted cash is not NAV. Do not fold balances into 0 PnL. */
export function statementPnlAgainstPostedBalances(
  owner: StatementPnlOwner,
  balances: readonly Balance[],
): StatementPnlResult {
  void balances;
  const out = statementPnlFromThisBook(owner);
  if (out.status !== 'refused' || out.realized !== null || out.unrealized !== null || out.nav !== null) {
    return refuseMissing(owner);
  }
  return out;
}

export async function handleStatementPnlFromBook(
  ledger: {
    balances(
      ownerType: StatementPnlOwner['ownerType'],
      ownerId: string,
    ): Promise<readonly Balance[]>;
  },
  body: unknown,
): Promise<StatementPnlResult> {
  const input = statementPnlBookInputSchema.parse(body);
  const owner: StatementPnlOwner = {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    reportingAssetId: input.reportingAssetId,
  };
  if (
    input.inventFifoFromHistory === true ||
    input.lotsFromHistory === true ||
    (input.costBasis !== undefined && input.costBasis !== null)
  ) {
    return refuseMissing(owner);
  }
  const balances = await ledger.balances(input.ownerType, input.ownerId);
  return statementPnlAgainstPostedBalances(owner, balances);
}
