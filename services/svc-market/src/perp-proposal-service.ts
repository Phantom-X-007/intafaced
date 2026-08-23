import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { assessPerpListing } from './perp-listing-eligibility.js';
import { MarketError, type VendorService } from './vendor-service.js';

export type PerpProposalStatus = 'proposed' | 'listed_unorderable' | 'orderable';

export interface ProposePerpInput {
  clientProposalId: string;
  proposerId: string;
  symbol: string;
  settle: string;
  oracleSource: string;
  leverageCap: string;
}

export interface PerpProposalRecord {
  id: string;
  proposerId: string;
  symbol: string;
  settle: string;
  oracleSource: string;
  leverageCap: string;
  status: PerpProposalStatus;
  /** Derived from persisted status; creation always returns false. */
  orderable: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProposalRow {
  id: string;
  proposer_id: string;
  symbol: string;
  settle: string;
  oracle_source: string;
  leverage_cap: string;
  status: PerpProposalStatus;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: ProposalRow): PerpProposalRecord {
  return {
    id: row.id,
    proposerId: row.proposer_id,
    symbol: row.symbol,
    settle: row.settle,
    oracleSource: row.oracle_source,
    leverageCap: formatAmount(parseAmount(String(row.leverage_cap))),
    status: row.status,
    orderable: row.status === 'orderable',
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PerpProposalService {
  constructor(
    private readonly sql: Sql,
    private readonly vendors: VendorService,
  ) {}

  async propose(input: ProposePerpInput): Promise<PerpProposalRecord> {
    const symbol = typeof input.symbol === 'string' ? input.symbol.trim() : '';
    if (!symbol) throw new MarketError('A perpetual proposal requires a symbol.', 'market.symbol_unset');

    const assessed = assessPerpListing({ settle: input.settle, oracleSource: input.oracleSource, leverageCap: input.leverageCap });
    if (!assessed.orderable) throw new MarketError(assessed.code, assessed.code, { missing: assessed.missing });

    const eligibility = await this.vendors.listingEligibility({ userId: input.proposerId });
    if (!eligibility.listed) {
      throw new MarketError(
        eligibility.reason ?? eligibility.code ?? 'Vendor is not eligible to propose a listing.',
        eligibility.code ?? 'market.vendor_not_approved',
      );
    }

    const canonical = {
      id: input.clientProposalId,
      proposerId: input.proposerId,
      symbol,
      settle: input.settle.trim(),
      oracleSource: input.oracleSource.trim(),
      leverageCap: formatAmount(parseAmount(input.leverageCap)),
    };

    return transaction(this.sql, async (tx) => {
      const inserted = await tx<ProposalRow[]>`
        INSERT INTO market.perp_proposals
          (id, proposer_id, symbol, settle, oracle_source, leverage_cap, status)
        VALUES
          (${canonical.id}, ${canonical.proposerId}, ${canonical.symbol}, ${canonical.settle}, ${canonical.oracleSource}, ${canonical.leverageCap}::numeric, 'proposed')
        ON CONFLICT (id) DO NOTHING
        RETURNING id, proposer_id, symbol, settle, oracle_source, leverage_cap::text, status, created_at, updated_at
      `;

      let row = inserted[0];
      if (!row) {
        [row] = await tx<ProposalRow[]>`
          SELECT id, proposer_id, symbol, settle, oracle_source, leverage_cap::text, status, created_at, updated_at
            FROM market.perp_proposals
           WHERE id = ${canonical.id}
        `;
      }
      if (!row) throw new MarketError('The proposal could not be read after insert.', 'market.perp_proposal_unavailable');

      const same =
        row.proposer_id === canonical.proposerId &&
        row.symbol === canonical.symbol &&
        row.settle === canonical.settle &&
        row.oracle_source === canonical.oracleSource &&
        formatAmount(parseAmount(String(row.leverage_cap))) === canonical.leverageCap;
      if (!same) {
        throw new MarketError('This proposal id already names different terms.', 'market.perp_proposal_conflict');
      }

      if (inserted.length === 1) {
        await tx`
          INSERT INTO market.perp_proposal_status_events
            (proposal_id, from_status, to_status, actor_id, reason)
          VALUES (${canonical.id}, NULL, 'proposed', ${canonical.proposerId}, 'proposal.created')
        `;
      }
      return toRecord(row);
    });
  }
}
