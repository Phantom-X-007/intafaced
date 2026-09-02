export interface CollarResult {
  readonly accepted: boolean;
  readonly marketId: MarketId;
  readonly rejected?: RejectReason;
}

/** Alias for the owner-policy mill. band is always null — unpublished is not zero. */
export type CollarPolicyResult = CollarResult & {
  readonly unpublished: true;
  readonly band: null;
};
