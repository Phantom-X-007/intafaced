/**
 * Named surveillance case for a known matching-abuse event (PTX-M16 first slice).
 * Evidence only — not a sanction, not a money movement, not a regulator product.
 * Unknown pattern refuses rather than auto-adjudicate.
 * Auto-close, fine, and punish are forbidden.
 */
import type { AccountId, MarketId } from './types.js';

export const SURVEILLANCE_REASONS = ['self_trade', 'spoofing', 'layering'] as const;
export type SurveillanceReason = (typeof SURVEILLANCE_REASONS)[number];

export const MISSING_ACCOUNT = 'missing_account' as const;
export const MISSING_MARKET = 'missing_market' as const;
export const MISSING_REASON = 'missing_reason' as const;
export const UNKNOWN_PATTERN = 'unknown_pattern' as const;
export const AUTO_CLOSE_FORBIDDEN = 'auto_close_forbidden' as const;
export const INVENTED_SANCTION = 'invented_sanction' as const;

export type SurveillanceRefuseCode =
  | typeof MISSING_ACCOUNT
  | typeof MISSING_MARKET
  | typeof MISSING_REASON
  | typeof UNKNOWN_PATTERN
  | typeof AUTO_CLOSE_FORBIDDEN
  | typeof INVENTED_SANCTION;

export interface SurveillanceCase {
  readonly accountId: AccountId;
  readonly marketId: MarketId;
  readonly reason: SurveillanceReason;
  /** Open is the only status. Close is a later owner disposition, never automatic. */
  readonly status: 'open';
}

export interface SurveillanceRefuse {
  readonly ok: false;
  readonly code: SurveillanceRefuseCode;
  readonly message: string;
}

export type OpenSurveillanceCaseResult = { readonly ok: true; readonly case: SurveillanceCase } | SurveillanceRefuse;

function readRequired(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isSurveillanceReason(value: string): value is SurveillanceReason {
  return (SURVEILLANCE_REASONS as readonly string[]).includes(value);
}

/** Opening a case requires account, market, and a named reason. Blank reason refuses. */
export function openSurveillanceCase(input: {
  readonly accountId?: string | null;
  readonly marketId?: string | null;
  readonly reason?: string | null;
}): OpenSurveillanceCaseResult {
  const accountId = readRequired(input.accountId);
  if (accountId === null) {
    return {
      ok: false,
      code: MISSING_ACCOUNT,
      message: 'a surveillance case requires accountId; the engine does not invent an owner',
    };
  }
  const marketId = readRequired(input.marketId);
  if (marketId === null) {
    return {
      ok: false,
      code: MISSING_MARKET,
      message: 'a surveillance case requires marketId; the engine does not invent a book',
    };
  }
  const reason = readRequired(input.reason);
  if (reason === null) {
    return {
      ok: false,
      code: MISSING_REASON,
      message: 'a surveillance case requires a reason; blank does not open a case',
    };
  }
  if (!isSurveillanceReason(reason)) {
    return {
      ok: false,
      code: UNKNOWN_PATTERN,
      message: `pattern ${reason} is unknown — refused rather than auto-adjudicated`,
    };
  }
  return {
    ok: true,
    case: {
      accountId,
      marketId,
      reason,
      status: 'open',
    },
  };
}

export function closeSurveillanceCase(): SurveillanceRefuse {
  return {
    ok: false,
    code: AUTO_CLOSE_FORBIDDEN,
    message: 'auto-close is forbidden; a case is evidence, not a disposition',
  };
}

export function fineSurveillanceCase(): SurveillanceRefuse {
  return {
    ok: false,
    code: INVENTED_SANCTION,
    message: 'a fine is an invented sanction; a case is evidence, not a money movement',
  };
}

export function punishSurveillanceCase(): SurveillanceRefuse {
  return {
    ok: false,
    code: INVENTED_SANCTION,
    message: 'punish is an invented sanction; a case is evidence, not a disposition',
  };
}
