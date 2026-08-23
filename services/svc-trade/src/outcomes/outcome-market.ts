import { formatAmount, parseAmount } from '@intafaced/ledger-client';

export type OutcomeSide = 'yes' | 'no';

export type OutcomeMarketRefuseCode =
  | 'trade.outcome_id_invalid'
  | 'trade.outcome_question_invalid'
  | 'trade.outcome_close_at_invalid'
  | 'trade.outcome_settlement_asset_unset'
  | 'trade.outcome_settlement_source_unset'
  | 'trade.outcome_size_invalid';

export class OutcomeMarketError extends Error {
  constructor(
    message: string,
    readonly code: OutcomeMarketRefuseCode,
  ) {
    super(message);
    this.name = 'OutcomeMarketError';
  }
}

export interface CreateOutcomeMarketInput {
  id: string;
  question: string;
  /** ISO timestamp named by the listing; this module never derives one. */
  closeAt: string;
  /** Existing ledger asset id named by the listing owner. */
  settlementAssetId: string;
  /** Owner-approved result source identifier, not a UI-provided result. */
  settlementSource: string;
}

export interface OutcomeMarket {
  id: string;
  kind: 'outcome';
  question: string;
  closeAt: string;
  settlementAssetId: string;
  settlementSource: string;
  collateralization: 'full';
  instruments: readonly [{ outcome: 'yes'; symbol: string }, { outcome: 'no'; symbol: string }];
}

function required(value: unknown, code: OutcomeMarketRefuseCode, label: string): string {
  if (typeof value !== 'string') throw new OutcomeMarketError(`${label} is required`, code);
  const trimmed = value.trim();
  if (!trimmed) throw new OutcomeMarketError(`${label} is required`, code);
  return trimmed;
}

/**
 * Define two instruments that can be registered against the existing matching
 * service. This is metadata only: it creates no local book and moves no value.
 */
export function createOutcomeMarket(input: CreateOutcomeMarketInput): OutcomeMarket {
  const id = required(input.id, 'trade.outcome_id_invalid', 'Outcome market id');
  const question = required(input.question, 'trade.outcome_question_invalid', 'Outcome question');
  const settlementAssetId = required(input.settlementAssetId, 'trade.outcome_settlement_asset_unset', 'Settlement asset');
  const settlementSource = required(input.settlementSource, 'trade.outcome_settlement_source_unset', 'Settlement source');
  const closeAt = required(input.closeAt, 'trade.outcome_close_at_invalid', 'Close time');
  if (!Number.isFinite(Date.parse(closeAt))) {
    throw new OutcomeMarketError('Close time must be an ISO timestamp', 'trade.outcome_close_at_invalid');
  }

  return {
    id,
    kind: 'outcome',
    question,
    closeAt,
    settlementAssetId,
    settlementSource,
    collateralization: 'full',
    instruments: [
      { outcome: 'yes', symbol: `${id}:YES` },
      { outcome: 'no', symbol: `${id}:NO` },
    ],
  };
}

/**
 * Full collateral for one binary buy is one settlement unit per contract.
 * The wire stays decimal-string and the in-memory validation is scaled bigint
 * through ledger-client; there is no JS number on the value path.
 */
export function collateralForBinaryBuy(size: string): string {
  if (typeof size !== 'string') {
    throw new OutcomeMarketError('Outcome size must be a decimal string', 'trade.outcome_size_invalid');
  }
  try {
    const scaled = parseAmount(size);
    if (scaled <= 0n) throw new Error('non-positive');
    return formatAmount(scaled);
  } catch {
    throw new OutcomeMarketError('Outcome size must be a positive decimal string', 'trade.outcome_size_invalid');
  }
}
