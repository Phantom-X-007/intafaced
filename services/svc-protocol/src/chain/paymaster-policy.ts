/**
 * Paymaster sponsorship policy (S-A10) — who may be sponsored, for what, how abuse refuses.
 * The funded deposit account is Nitro Class X; this module only encodes rules.
 */
export type SponsorshipDecision =
  { allow: true; maxGas: bigint } | { allow: false; reason: 'not_allowlisted' | 'op_not_permitted' | 'gas_cap' | 'funding_unconfigured' };

export type SponsorshipPolicy = {
  /** Empty = nobody sponsored until Nitro configures. */
  allowlist: ReadonlySet<string>;
  permittedSelectors: ReadonlySet<string>;
  maxGasPerUserOp: bigint;
  /** False until Nitro funds a paymaster deposit. */
  fundingConfigured: boolean;
};

export function decideSponsorship(
  policy: SponsorshipPolicy,
  input: { sender: string; callSelector: string; gasLimit: bigint },
): SponsorshipDecision {
  if (!policy.fundingConfigured) return { allow: false, reason: 'funding_unconfigured' };
  const sender = input.sender.toLowerCase();
  if (![...policy.allowlist].some((a) => a.toLowerCase() === sender)) {
    return { allow: false, reason: 'not_allowlisted' };
  }
  const sel = input.callSelector.toLowerCase();
  if (!policy.permittedSelectors.has(sel) && !policy.permittedSelectors.has(input.callSelector)) {
    return { allow: false, reason: 'op_not_permitted' };
  }
  if (input.gasLimit > policy.maxGasPerUserOp) return { allow: false, reason: 'gas_cap' };
  return { allow: true, maxGas: policy.maxGasPerUserOp };
}
