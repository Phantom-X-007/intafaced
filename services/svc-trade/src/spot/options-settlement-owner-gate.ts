/**
 * trade.options P0-05 + D7 owner env gates — opaque stamps, refuse when unset.
 *
 * Never parses live set / settlement asset / fixing source — presence only.
 */
export const TRADE_OPTIONS_SETTLEMENT_ASSET_LAW_ENV = 'TRADE_OPTIONS_SETTLEMENT_ASSET_LAW' as const;
export const TRADE_OPTIONS_SETTLEMENT_FIXING_ENV = 'TRADE_OPTIONS_SETTLEMENT_FIXING' as const;

export type OptionsSettlementRefuseReason = 'settlement_law_unset' | 'fixing_unset';

export type OptionsSettlementLawGate =
  | { readonly configured: true; readonly stamp: string }
  | { readonly configured: false; readonly reason: OptionsSettlementRefuseReason; readonly detail: string };

export type OptionsSettlementFixingGate =
  | { readonly configured: true; readonly stamp: string }
  | { readonly configured: false; readonly reason: OptionsSettlementRefuseReason; readonly detail: string };

export function optionsSettlementAssetLawGate(env: NodeJS.ProcessEnv = process.env): OptionsSettlementLawGate {
  const stamp = env[TRADE_OPTIONS_SETTLEMENT_ASSET_LAW_ENV]?.trim() ?? '';
  if (!stamp) {
    return {
      configured: false,
      reason: 'settlement_law_unset',
      detail: `${TRADE_OPTIONS_SETTLEMENT_ASSET_LAW_ENV} is unset — never invent live set / settlement asset / refuse matrix`,
    };
  }
  return { configured: true, stamp };
}

export function optionsSettlementFixingGate(env: NodeJS.ProcessEnv = process.env): OptionsSettlementFixingGate {
  const stamp = env[TRADE_OPTIONS_SETTLEMENT_FIXING_ENV]?.trim() ?? '';
  if (!stamp) {
    return {
      configured: false,
      reason: 'fixing_unset',
      detail: `${TRADE_OPTIONS_SETTLEMENT_FIXING_ENV} is unset — D7 fixing is owner law; never invent source/window/payor`,
    };
  }
  return { configured: true, stamp };
}
