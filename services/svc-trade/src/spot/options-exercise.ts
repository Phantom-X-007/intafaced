/**
 * Options exercise / assignment / expiry mill (R-E5 / PTX-M11-R08).
 *
 * Hitch: European cash classification from an owner decimal fixing only.
 * Blank TRADE_OPTIONS_SETTLEMENT_FIXING → `trade.options_fixing_unconfigured`.
 * Blank settlement asset (law stamp or explicit asset) → `trade.options_settlement_law_unset`.
 * lastTrade / mark are accepted only so tests can prove they are ignored.
 * Never last trade as fixing. Never invent a settlement asset, multiplier, ATM
 * treatment, or options ledger recipe. PX-S08-O02 stays open — this mill does
 * not post. Listing gates in `options-listing.ts` stay refuse-closed (R-E8).
 *
 * Idempotent on outcome id (`option-exercise|assign|expire:${positionId}`).
 */
import { formatAmount, parseAmount, type Amount, type LedgerClient, type PostRequest } from '@intafaced/ledger-client';
import {
  OPTIONS_FIXING_UNCONFIGURED,
  OPTIONS_SETTLEMENT_LAW_UNSET,
  OPTIONS_TERMS_INCOMPLETE,
  type OptionStyle,
  type OptionType,
} from './options-policy.js';
import type { MarketKind } from './types.js';

export { OPTIONS_FIXING_UNCONFIGURED, OPTIONS_SETTLEMENT_LAW_UNSET, OPTIONS_TERMS_INCOMPLETE };

export type OptionsExerciseKind = 'exercise' | 'assignment' | 'expire';

export function optionsExerciseIdFor(positionId: string): string {
  return `option-exercise:${positionId}`;
}

export function optionsAssignmentIdFor(positionId: string): string {
  return `option-assign:${positionId}`;
}

export function optionsExpiryIdFor(positionId: string): string {
  return `option-expire:${positionId}`;
}

export function optionsOutcomeIdFor(kind: OptionsExerciseKind, positionId: string): string {
  if (kind === 'exercise') return optionsExerciseIdFor(positionId);
  if (kind === 'assignment') return optionsAssignmentIdFor(positionId);
  return optionsExpiryIdFor(positionId);
}

export type OptionsExercisePosition = {
  readonly positionId: string;
  readonly userId: string;
  readonly side: 'long' | 'short';
  readonly size: Amount;
};

export type OptionsExerciseOutcome = {
  readonly kind: OptionsExerciseKind;
  readonly outcomeId: string;
  readonly positionId: string;
};

export type OptionsExerciseJobResult =
  | { readonly status: 'skipped'; readonly reason: 'not_options' | 'not_expired'; readonly posts: readonly PostRequest[] }
  | {
      readonly status: 'refused';
      readonly reason: 'settlement_law_unset' | 'fixing_unconfigured' | 'terms_incomplete';
      readonly code: typeof OPTIONS_SETTLEMENT_LAW_UNSET | typeof OPTIONS_FIXING_UNCONFIGURED | typeof OPTIONS_TERMS_INCOMPLETE;
      readonly posts: readonly PostRequest[];
    }
  | {
      readonly status: 'classified';
      readonly settlementPrice: string;
      readonly source: 'owner_fixing';
      readonly posts: readonly PostRequest[];
      readonly outcomes: readonly OptionsExerciseOutcome[];
    };

export interface OptionsExerciseMarket {
  readonly marketId: string;
  readonly kind: MarketKind;
  readonly optionType: OptionType | null;
  readonly optionStyle: OptionStyle | null;
  readonly strike: Amount | null;
  readonly expiryAt: Date | null;
}

function hasValidExpiry(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function parseOwnerDecimal(raw: string | null | undefined): Amount | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return null;
  try {
    const price = parseAmount(trimmed);
    return price > 0n ? price : null;
  } catch {
    return null;
  }
}

/**
 * European cash ITM/OTM from owner fixing vs strike. ATM is owner law
 * (PX-S08-O04) — refuse rather than invent auto-exercise.
 */
export function classifyEuropeanCash(input: {
  readonly optionType: OptionType;
  readonly side: 'long' | 'short';
  readonly strike: Amount;
  readonly fixing: Amount;
}): { readonly kind: OptionsExerciseKind } | { readonly kind: 'refused'; readonly reason: 'atm_treatment_unset' } {
  if (input.fixing === input.strike) {
    return { kind: 'refused', reason: 'atm_treatment_unset' };
  }
  const callItm = input.optionType === 'call' && input.fixing > input.strike;
  const putItm = input.optionType === 'put' && input.fixing < input.strike;
  const itm = callItm || putItm;
  if (!itm) return { kind: 'expire' };
  return { kind: input.side === 'long' ? 'exercise' : 'assignment' };
}

/**
 * One-series expiry job. Does not post. Does not invent a settlement price
 * from last trade, mark, or depth. Does not invent a settlement asset from
 * the opaque TRADE_OPTIONS_SETTLEMENT_ASSET_LAW stamp.
 */
export async function runOptionsExerciseJob(input: {
  readonly kind: MarketKind;
  readonly optionType: OptionType | null;
  readonly optionStyle: OptionStyle | null;
  readonly strike: Amount | null;
  readonly expiryAt: Date | null;
  readonly now: Date;
  /** Opaque P0-05 stamp (`TRADE_OPTIONS_SETTLEMENT_ASSET_LAW`). Empty refuses. */
  readonly settlementAssetLawConfigured: string | null | undefined;
  /** Opaque D7 stamp (`TRADE_OPTIONS_SETTLEMENT_FIXING`). Empty refuses. */
  readonly settlementFixingConfigured: string | null | undefined;
  /** Owner-published settlement/fixing price (decimal string). Empty refuses. */
  readonly ownerSettlementPrice: string | null | undefined;
  /**
   * Owner-named settlement asset. Empty refuses. NEVER parsed from the law stamp.
   * Production omits this (SOCKET §13).
   */
  readonly settlementAsset: string | null | undefined;
  /** MUST NOT be used. Present so tests can prove last-trade is not settlement. */
  readonly lastTradePrice?: string | null;
  /** MUST NOT be used. Present so tests can prove mark is not settlement. */
  readonly markPrice?: string | null;
  readonly positions: readonly OptionsExercisePosition[];
  readonly ledger: Pick<LedgerClient, 'post'>;
}): Promise<OptionsExerciseJobResult> {
  void input.lastTradePrice;
  void input.markPrice;
  void input.ledger;
  const emptyPosts: readonly PostRequest[] = [];

  if (input.kind !== 'options') {
    return { status: 'skipped', reason: 'not_options', posts: emptyPosts };
  }
  if (!hasValidExpiry(input.expiryAt) || input.now.getTime() < input.expiryAt.getTime()) {
    return { status: 'skipped', reason: 'not_expired', posts: emptyPosts };
  }

  const law = (input.settlementAssetLawConfigured ?? '').trim();
  if (law.length === 0) {
    return {
      status: 'refused',
      reason: 'settlement_law_unset',
      code: OPTIONS_SETTLEMENT_LAW_UNSET,
      posts: emptyPosts,
    };
  }

  const fixingStamp = (input.settlementFixingConfigured ?? '').trim();
  if (fixingStamp.length === 0) {
    return {
      status: 'refused',
      reason: 'fixing_unconfigured',
      code: OPTIONS_FIXING_UNCONFIGURED,
      posts: emptyPosts,
    };
  }

  const asset = (input.settlementAsset ?? '').trim();
  if (asset.length === 0) {
    return {
      status: 'refused',
      reason: 'settlement_law_unset',
      code: OPTIONS_SETTLEMENT_LAW_UNSET,
      posts: emptyPosts,
    };
  }

  const fixing = parseOwnerDecimal(input.ownerSettlementPrice);
  if (fixing == null) {
    return {
      status: 'refused',
      reason: 'fixing_unconfigured',
      code: OPTIONS_FIXING_UNCONFIGURED,
      posts: emptyPosts,
    };
  }

  if (input.optionType !== 'call' && input.optionType !== 'put') {
    return { status: 'refused', reason: 'terms_incomplete', code: OPTIONS_TERMS_INCOMPLETE, posts: emptyPosts };
  }
  if ((input.optionStyle ?? 'european') !== 'european') {
    return { status: 'refused', reason: 'terms_incomplete', code: OPTIONS_TERMS_INCOMPLETE, posts: emptyPosts };
  }
  if (input.strike == null || input.strike <= 0n) {
    return { status: 'refused', reason: 'terms_incomplete', code: OPTIONS_TERMS_INCOMPLETE, posts: emptyPosts };
  }

  const outcomes: OptionsExerciseOutcome[] = [];
  for (const position of input.positions) {
    if (position.size <= 0n) continue;
    const classified = classifyEuropeanCash({
      optionType: input.optionType,
      side: position.side,
      strike: input.strike,
      fixing,
    });
    if (classified.kind === 'refused') {
      // ATM treatment is owner law (PX-S08-O04) — omit, never auto-exercise/expire.
      continue;
    }
    outcomes.push({
      kind: classified.kind,
      outcomeId: optionsOutcomeIdFor(classified.kind, position.positionId),
      positionId: position.positionId,
    });
  }

  return {
    status: 'classified',
    settlementPrice: formatAmount(fixing),
    source: 'owner_fixing',
    posts: emptyPosts,
    outcomes,
  };
}
