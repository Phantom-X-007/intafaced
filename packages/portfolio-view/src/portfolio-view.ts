/**
 * Portfolio Stage-1 — a VIEW over the ledger book. Not a second book.
 *
 * Law §25:723 / D-S-18: a holding the platform cannot read is ABSENT AND NAMED,
 * never zero. Indexer read-models are unbuilt, so the on-chain half is named
 * `indexer.readmodels_unbuilt`. Custodial holdings are whatever `ledger.balances`
 * already returned — empty is empty, never invented volume.
 */
import { z } from 'zod';
import { formatAmount, type Balance, type OwnerType } from '@intafaced/ledger-client';

export const INDEXER_READMODELS_UNBUILT = 'indexer.readmodels_unbuilt' as const;

export const INDEXER_ABSENT = {
  status: 'absent',
  reason: INDEXER_READMODELS_UNBUILT,
} as const;

export type IndexerAbsent = typeof INDEXER_ABSENT;

export const indexerAbsentSchema = z.object({
  status: z.literal('absent'),
  reason: z.literal(INDEXER_READMODELS_UNBUILT),
});

export const custodialHoldingSchema = z.object({
  accountId: z.string(),
  assetId: z.string(),
  kind: z.string(),
  purpose: z.string(),
  /** Decimal string. Money never crosses as a `number`. */
  amount: z.string(),
});

export const portfolioViewSchema = z.object({
  ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']),
  ownerId: z.string(),
  custodial: z.array(custodialHoldingSchema),
  indexer: indexerAbsentSchema,
});

export type CustodialHolding = z.infer<typeof custodialHoldingSchema>;
export type PortfolioView = z.infer<typeof portfolioViewSchema>;

export interface PortfolioViewInput {
  readonly ownerType: OwnerType;
  readonly ownerId: string;
  readonly balances: readonly Balance[];
}

/**
 * Map existing ledger balances into a portfolio view. Read-only: does not post.
 * Does not invent chain amounts. Does not fill an empty custodial book.
 */
export function portfolioViewFromLedgerBalances(input: PortfolioViewInput): PortfolioView {
  return {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    custodial: input.balances.map((b) => ({
      accountId: b.accountId,
      assetId: b.account.assetId,
      kind: b.account.kind,
      purpose: b.account.purpose ?? '',
      amount: formatAmount(b.amount),
    })),
    indexer: INDEXER_ABSENT,
  };
}
