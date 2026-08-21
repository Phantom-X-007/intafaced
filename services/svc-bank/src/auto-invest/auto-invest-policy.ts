/**
 * bank.auto-invest product policy — F-plane honesty (no invented rates).
 */
export const AUTO_INVEST_RATE_UNSET = 'bank.auto_invest_rate_unset' as const;
export const AUTO_INVEST_DISABLED = 'bank.auto_invest_disabled' as const;

export const AUTO_INVEST_KINDS = ['threshold_sweep', 'dca', 'card_roundup'] as const;

export type AutoInvestPolicySummary = {
  readonly enabled: boolean;
  readonly convertWired: boolean;
  readonly rateUnsetCode: typeof AUTO_INVEST_RATE_UNSET;
  readonly disabledCode: typeof AUTO_INVEST_DISABLED;
  readonly kinds: readonly (typeof AUTO_INVEST_KINDS)[number][];
  readonly dcaRequiresConvert: true;
  readonly crossAssetRoundUpRequiresConvert: true;
  readonly thresholdSweepSameAssetOnly: true;
  readonly inventsRates: false;
};

export function describeAutoInvestPolicy(input: { readonly enabled: boolean; readonly convertWired: boolean }): AutoInvestPolicySummary {
  return {
    enabled: input.enabled,
    convertWired: input.convertWired,
    rateUnsetCode: AUTO_INVEST_RATE_UNSET,
    disabledCode: AUTO_INVEST_DISABLED,
    kinds: AUTO_INVEST_KINDS,
    dcaRequiresConvert: true,
    crossAssetRoundUpRequiresConvert: true,
    thresholdSweepSameAssetOnly: true,
    inventsRates: false,
  };
}
