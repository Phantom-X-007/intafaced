/**
 * @intafaced/portfolio-view — §25:723 Stage-1 custodial holdings view.
 *
 * Reads ledger balances. Does not post. Does not invent chain positions.
 */
export {
  INDEXER_ABSENT,
  PORTFOLIO_INDEXER_UNWIRED,
  custodialHoldingSchema,
  indexerAbsentSchema,
  portfolioViewFromLedgerBalances,
  portfolioViewSchema,
  type CustodialHolding,
  type IndexerAbsent,
  type PortfolioView,
  type PortfolioViewInput,
} from './portfolio-view.js';
