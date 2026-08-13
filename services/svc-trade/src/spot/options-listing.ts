import type { Amount } from '@intafaced/ledger-client';
import { TradeError, type MarketKind } from './types.js';

/**
 * OPTIONS LISTING — refuse-closed until D26-P0-05 (settlement asset law).
 *
 * ── SOCKET §13 · `socket.options-settlement-asset-law` ──────────────────────
 * Full-collateral European options need no IV surface: payoff is mechanical once
 * a settlement price and settlement *asset* are known. P0-05 owns the ADR for
 * live instrument set, settlement asset, and refuse matrix. Agents do not invent
 * that law. Until the operator stamps that ADR is published
 * (`TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` non-empty opaque id), kind=options cannot
 * be listed — even if D7 fixing and European terms are complete.
 *
 * After P0-05 is stamped: D7 fixing (`TRADE_OPTIONS_SETTLEMENT_FIXING`) must still
 * be configured, and the row must carry complete European contract terms so a
 * half-listed option cannot exist (mirrored by `markets_options_terms_ck`).
 *
 * Opaque stamps are never parsed for live set / settlement asset / refuse matrix
 * / source / window / payor — inventing those fields here would be the failure
 * this socket exists to prevent.
 *
 * Listing is not trading: `assertTradable` still refuses options orders by kind
 * until an options engine exists.
 */

export type OptionType = 'call' | 'put';
/** v1 title is European only — American is not modelled. */
export type OptionStyle = 'european';

export interface OptionsContractTerms {
  readonly optionType: OptionType;
  readonly optionStyle: OptionStyle;
  readonly strike: Amount;
  readonly expiryAt: Date;
  /** Opaque operator string from `TRADE_OPTIONS_SETTLEMENT_FIXING` — not parsed. */
  readonly settlementFixing: string;
}

export interface ResolveOptionsListingInput {
  readonly kind: MarketKind;
  /**
   * Opaque stamp that P0-05 ADR is published (`TRADE_OPTIONS_SETTLEMENT_ASSET_LAW`).
   * Empty / whitespace = unset → refuse. Never parsed for assets or matrix rows.
   */
  readonly settlementAssetLawConfigured: string;
  /**
   * Deployment config for D7 fixing. Empty / whitespace = not configured.
   * Presence is the only signal — this function never invents source/window/account.
   */
  readonly settlementFixingConfigured: string;
  readonly optionType?: OptionType | null;
  readonly optionStyle?: OptionStyle | null;
  readonly strike?: Amount | null;
  readonly expiryAt?: Date | null;
}

/**
 * Resolve option contract terms for a listing, or null for non-options.
 *
 * Throws `trade.options_settlement_law_unset` when kind is options and P0-05 law
 * is blank (SOCKET §13). Throws `trade.options_fixing_unconfigured` when fixing
 * is blank. Throws `trade.options_terms_incomplete` when terms are partial or
 * attached to a non-options kind.
 */
export function resolveOptionsListing(input: ResolveOptionsListingInput): OptionsContractTerms | null {
  const hasAnyTerm =
    input.optionType != null ||
    input.optionStyle != null ||
    input.strike != null ||
    (input.expiryAt != null && !Number.isNaN(input.expiryAt.getTime()));

  if (input.kind !== 'options') {
    if (hasAnyTerm) {
      throw new TradeError(
        'option contract terms are only valid when kind is options — refuse half-shaped listings',
        'trade.options_terms_incomplete',
      );
    }
    return null;
  }

  // ── SOCKET §13 · `socket.options-settlement-asset-law` (D26-P0-05) ────────
  // First gate: no invent of live set / settlement asset / refuse matrix.
  const assetLaw = input.settlementAssetLawConfigured.trim();
  if (assetLaw.length === 0) {
    throw new TradeError(
      'options cannot be listed until D26-P0-05 settlement asset law is published (TRADE_OPTIONS_SETTLEMENT_ASSET_LAW empty) — SOCKET §13 socket.options-settlement-asset-law; empty means refuse, never invent live set / settlement asset / refuse matrix',
      'trade.options_settlement_law_unset',
    );
  }

  const fixing = input.settlementFixingConfigured.trim();
  if (fixing.length === 0) {
    throw new TradeError(
      'options cannot be listed until settlement fixing is configured (TRADE_OPTIONS_SETTLEMENT_FIXING empty) — D7 is owner law; empty means refuse',
      'trade.options_fixing_unconfigured',
    );
  }

  if (input.optionType !== 'call' && input.optionType !== 'put') {
    throw new TradeError(
      'options listing requires optionType call|put — half-listed options are refused',
      'trade.options_terms_incomplete',
    );
  }

  // Default european when omitted: product title is European v1. Explicit non-european refuses.
  const optionStyle: OptionStyle = input.optionStyle ?? 'european';
  if (optionStyle !== 'european') {
    throw new TradeError('v1 options are european only — half-listed or unsupported style is refused', 'trade.options_terms_incomplete');
  }

  if (input.strike == null || input.strike <= 0n) {
    throw new TradeError('options listing requires strike > 0 — half-listed options are refused', 'trade.options_terms_incomplete');
  }

  if (!(input.expiryAt instanceof Date) || Number.isNaN(input.expiryAt.getTime())) {
    throw new TradeError('options listing requires a valid expiryAt — half-listed options are refused', 'trade.options_terms_incomplete');
  }

  return {
    optionType: input.optionType,
    optionStyle,
    strike: input.strike,
    expiryAt: input.expiryAt,
    settlementFixing: fixing,
  };
}
