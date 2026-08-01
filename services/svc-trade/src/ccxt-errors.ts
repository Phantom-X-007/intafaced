import { AuthError, type AuthErrorCode } from '@intafaced/auth';
import { type ExchangeErrorCode } from '@intafaced/exchange-contract';
import { InsufficientFundsError, LedgerError, MoneyError } from '@intafaced/ledger-client';
import { MatchingUnavailableError } from './spot/matching-client.js';
import { TradeError, type TradeErrorCode } from './spot/types.js';

/**
 * CCXT ERROR TAXONOMY FOR THE PUBLIC REST SURFACE (trade.ccxt-api).
 *
 * A CCXT client does not read our error strings. It branches on the error
 * *class*, and the branch decides whether it retries, re-quotes, drops the
 * symbol, or stops the bot. Returning one shape for every failure — or our own
 * internal `trade.*` codes, which is what this surface did before — makes the
 * contract unusable by exactly the integrators it exists for:
 *
 *   - `InsufficientFunds` must never be retried. Retrying it is a hot loop
 *     against a wall, and on a venue that rate-limits, a ban.
 *   - `ExchangeNotAvailable` / `OnMaintenance` **must** be retried with backoff.
 *     Reported as a permanent error, a bot shuts down over a restart.
 *   - `BadSymbol` means drop the symbol from the rotation permanently.
 *   - `InvalidOrder` means the order was malformed — fix and resubmit, do not
 *     resubmit unchanged.
 *   - `NotSupported` means stop calling this method entirely.
 *
 * Getting this backwards is worse than a 500, because a 500 at least tells the
 * client it does not know what happened. A confidently wrong class makes the
 * client act.
 *
 * `intafacedCode` carries our finer-grained code alongside, so an operator
 * debugging a support ticket loses nothing by us speaking CCXT on the wire.
 *
 * The mapping table below is the documented contract. Every arm is deliberate
 * and the `Record<TradeErrorCode, …>` is exhaustive **by type** — a new
 * TradeErrorCode fails the build here until someone decides how a bot should
 * react to it. That is the point: the reaction is a product decision, not a
 * default.
 */

export interface CcxtErrorBody {
  code: ExchangeErrorCode;
  message: string;
  /** Our own finer-grained code, e.g. 'trade.below_min_notional'. */
  intafacedCode?: string;
  /** Seconds until the caller may retry. Only ever set on RateLimitExceeded. */
  retryAfter?: number;
}

export interface CcxtErrorResponse {
  status: number;
  body: CcxtErrorBody;
}

interface Arm {
  ccxt: ExchangeErrorCode;
  status: number;
}

/**
 * Internal trade errors → CCXT class + HTTP status.
 *
 * The status codes matter almost as much as the class: CCXT's base client
 * inspects the HTTP status before it ever parses a body, and a 5xx is retried
 * by most transport wrappers regardless of payload. So anything a caller must
 * *not* retry stays in the 4xx range even when it is genuinely our fault.
 */
const TRADE_ERROR_MAP: Record<TradeErrorCode, Arm> = {
  // ── Symbol is wrong or unusable: stop asking for it ───────────────────────
  /** No such listing. A bot should drop it from its rotation. */
  'trade.market_not_found': { ccxt: 'BadSymbol', status: 404 },
  /** An operator halted this listing. Same client action as unknown: stop. */
  'trade.market_not_tradable': { ccxt: 'BadSymbol', status: 403 },
  /** Spot service cannot serve this market kind (futures/options listing). */
  'trade.market_kind_unsupported': { ccxt: 'BadSymbol', status: 403 },

  // ── Temporarily closed: retry later, do not drop the symbol ───────────────
  /**
   * Between sessions (FX weekend, CME break). Deliberately NOT BadSymbol: the
   * identical order is fine on Monday, and a bot that drops EUR/USD every
   * Saturday never trades it again.
   */
  'trade.market_closed': { ccxt: 'ExchangeNotAvailable', status: 503 },
  /** Operator kill-switch across the whole spot plane — venue-wide, retryable. */
  'trade.spot_disabled': { ccxt: 'OnMaintenance', status: 503 },
  'trade.seed_disabled': { ccxt: 'OnMaintenance', status: 503 },
  'trade.seed_must_make': { ccxt: 'InvalidOrder', status: 400 },
  'trade.convert_disabled': { ccxt: 'OnMaintenance', status: 503 },

  // ── The order itself is malformed: fix it, then resubmit ──────────────────
  'trade.order_type_unsupported': { ccxt: 'InvalidOrder', status: 400 },
  'trade.invalid_qty': { ccxt: 'InvalidOrder', status: 400 },
  'trade.invalid_price': { ccxt: 'InvalidOrder', status: 400 },
  'trade.below_min_notional': { ccxt: 'InvalidOrder', status: 400 },
  'trade.convert_invalid_qty': { ccxt: 'InvalidOrder', status: 400 },
  'trade.convert_missing_id': { ccxt: 'BadRequest', status: 400 },
  /**
   * Identity S2S ownership consult failed. Retryable — same posture as
   * `trade.perks_unavailable`: we will not guess ownership while identity is down.
   */
  'trade.sub_account_unavailable': { ccxt: 'ExchangeNotAvailable', status: 503 },
  /** Missing or foreign sub-account. Permanent for this id + principal. */
  'trade.sub_account_denied': { ccxt: 'PermissionDenied', status: 403 },
  /** Soft-revoked sub-account — create a new book; do not retry the same id. */
  'trade.sub_account_revoked': { ccxt: 'PermissionDenied', status: 403 },

  // ── Order lifecycle ───────────────────────────────────────────────────────
  'trade.order_not_found': { ccxt: 'OrderNotFound', status: 404 },
  /**
   * Cancelling an order that already filled or cancelled. CCXT venues answer
   * InvalidOrder here rather than OrderNotFound, because the order does exist
   * and a client that re-fetches will find it in a terminal state.
   */
  'trade.order_not_open': { ccxt: 'InvalidOrder', status: 409 },
  /** Someone else's order. Not "not found" — do not leak existence either way. */
  'trade.not_owner': { ccxt: 'PermissionDenied', status: 403 },

  // ── Cannot be filled at all right now ─────────────────────────────────────
  'trade.convert_no_liquidity': { ccxt: 'OrderNotFillable', status: 400 },
  'trade.convert_insufficient_depth': { ccxt: 'OrderNotFillable', status: 400 },
  'trade.convert_bad_depth': { ccxt: 'OrderNotFillable', status: 400 },
  /** Quote went stale between quote and accept — re-quote and try again. */
  'trade.convert_price_moved': { ccxt: 'InvalidOrder', status: 409 },

  // ── Market conditions the venue refuses to trade through ──────────────────
  'trade.convert_spread_too_high': { ccxt: 'ExchangeNotAvailable', status: 503 },
  'trade.convert_bad_spread': { ccxt: 'ExchangeNotAvailable', status: 503 },
  /**
   * No price source. This is the honesty rule in error form: we refuse rather
   * than quote a number we cannot source. Retryable — a feed can come back.
   */
  'trade.no_reference_price': { ccxt: 'ExchangeNotAvailable', status: 503 },
  /** Rank/perk lookup failed; we will not guess a fee tier. Retryable. */
  'trade.perks_unavailable': { ccxt: 'ExchangeNotAvailable', status: 503 },

  // ── Genuinely our fault, and not the caller's to fix ──────────────────────
  'trade.dust_fill': { ccxt: 'ExchangeError', status: 500 },
  'trade.hold_uncovered': { ccxt: 'ExchangeError', status: 500 },
};

/**
 * Auth failures → CCXT class.
 *
 * CCXT distinguishes `AuthenticationError` ("your credentials did not work")
 * from `PermissionDenied` ("they worked, and they are not enough"). A bot
 * re-signs on the first and gives up on the second; collapsing them makes a
 * missing scope look like a broken key and sends integrators hunting the wrong
 * bug for an afternoon.
 */
const AUTH_ERROR_MAP: Record<AuthErrorCode, Arm> = {
  'token.expired': { ccxt: 'AuthenticationError', status: 401 },
  'token.invalid': { ccxt: 'AuthenticationError', status: 401 },
  'token.malformed': { ccxt: 'AuthenticationError', status: 401 },
  /** Step-up required — the credential is valid, the session is not enough. */
  'mfa.required': { ccxt: 'AuthenticationError', status: 401 },
  'scope.denied': { ccxt: 'PermissionDenied', status: 403 },
  'tier.insufficient': { ccxt: 'PermissionDenied', status: 403 },
  'ownership.denied': { ccxt: 'PermissionDenied', status: 403 },
};

/** No edge-signed principal at all. */
export const UNAUTHENTICATED: CcxtErrorResponse = {
  status: 401,
  body: { code: 'AuthenticationError', message: 'Authentication required', intafacedCode: 'auth.required' },
};

/** Symbol that resolves to no listing — the single most common bot mistake. */
export function badSymbol(symbol: string): CcxtErrorResponse {
  return {
    status: 404,
    body: { code: 'BadSymbol', message: `market ${symbol} not found`, intafacedCode: 'trade.market_not_found' },
  };
}

/** Malformed query/path parameter that is not itself an order field. */
export function badRequest(message: string, intafacedCode: string): CcxtErrorResponse {
  return { status: 400, body: { code: 'BadRequest', message, intafacedCode } };
}

/** A route we mount on purpose and will not serve in this venue's shape. */
export function notSupported(message: string, intafacedCode: string): CcxtErrorResponse {
  return { status: 501, body: { code: 'NotSupported', message, intafacedCode } };
}

/**
 * Throttled. `retryAfter` is in seconds and is mandatory here — CCXT's
 * throttler reads it, and a RateLimitExceeded without one makes a client guess
 * the backoff, which is how a throttle turns into a ban.
 */
export function rateLimited(retryAfterSeconds: number, message = 'rate limit exceeded'): CcxtErrorResponse {
  return {
    status: 429,
    body: {
      code: 'RateLimitExceeded',
      message,
      intafacedCode: 'trade.rate_limited',
      retryAfter: Math.max(1, Math.ceil(retryAfterSeconds)),
    },
  };
}

/**
 * Jurisdiction / KYC refusal from `checkAccess`. The decision code is ours
 * (`kyc.tier_required`, geo blocks); the class a bot branches on is
 * PermissionDenied — credentials fine, this principal may not trade here.
 */
export function permissionDenied(message: string, intafacedCode: string): CcxtErrorResponse {
  return { status: 403, body: { code: 'PermissionDenied', message, intafacedCode } };
}

/**
 * A create-order body that failed schema validation. `InvalidOrder` rather than
 * `BadRequest`: it is specifically the order that is wrong, and that is the
 * branch a client's order-builder listens on.
 */
export function invalidOrder(message: string, intafacedCode = 'trade.validation_failed'): CcxtErrorResponse {
  return { status: 400, body: { code: 'InvalidOrder', message, intafacedCode } };
}

/**
 * Map any thrown error to the CCXT wire shape, or `null` when we do not
 * recognise it.
 *
 * Returning `null` rather than a catch-all `ExchangeError` is deliberate: an
 * unrecognised throw is a bug, and it must reach the Fastify error handler and
 * the logs as a 500 rather than be quietly relabelled into something a client
 * will confidently retry forever.
 */
export function toCcxtError(err: unknown): CcxtErrorResponse | null {
  if (err instanceof MatchingUnavailableError) {
    // The book is genuinely unreachable. Retryable, and 502 keeps it visibly
    // an upstream failure rather than the caller's fault.
    return {
      status: 502,
      body: {
        code: 'ExchangeNotAvailable',
        message: err.message,
        intafacedCode: 'trade.matching_unavailable',
      },
    };
  }

  if (err instanceof AuthError) {
    const arm = AUTH_ERROR_MAP[err.code];
    return { status: arm.status, body: { code: arm.ccxt, message: err.message, intafacedCode: err.code } };
  }

  if (err instanceof TradeError) {
    const arm = TRADE_ERROR_MAP[err.code];
    // A TradeErrorCode with no arm cannot happen through the type system, but
    // a value crossing a service boundary is not typed. Fall back to the
    // non-retryable generic rather than inventing a retry instruction.
    if (!arm) return { status: 400, body: { code: 'ExchangeError', message: err.message, intafacedCode: err.code } };
    return { status: arm.status, body: { code: arm.ccxt, message: err.message, intafacedCode: err.code } };
  }

  // Subclass before superclass: InsufficientFundsError extends LedgerError.
  if (err instanceof InsufficientFundsError) {
    return {
      status: 400,
      body: { code: 'InsufficientFunds', message: err.message, intafacedCode: err.code },
    };
  }

  if (err instanceof MoneyError) {
    // A malformed decimal on the wire — the caller's to fix.
    return { status: 400, body: { code: 'BadRequest', message: err.message, intafacedCode: 'money.invalid' } };
  }

  if (err instanceof LedgerError) {
    // The ledger refused for a reason that is not "not enough funds". Not the
    // caller's to fix and not retryable by simply resending.
    return { status: 400, body: { code: 'ExchangeError', message: err.message, intafacedCode: err.name } };
  }

  return null;
}

/** Read-only view of the mapping, for the contract test and for documentation. */
export const CCXT_ERROR_MAPPING: Readonly<Record<TradeErrorCode, Arm>> = TRADE_ERROR_MAP;
export const CCXT_AUTH_MAPPING: Readonly<Record<AuthErrorCode, Arm>> = AUTH_ERROR_MAP;
