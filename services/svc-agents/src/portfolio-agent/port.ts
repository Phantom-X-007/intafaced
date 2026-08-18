/**
 * Injected portfolio view — ops.portfolio is in-flight elsewhere.
 *
 * D-S-18 / tracker law: a holding the platform cannot read is ABSENT AND NAMED,
 * never zero. This port does not invent a book. Callers that omit it get a
 * named dark refuse from planRebalance — never a synthetic empty/zero book.
 */

export type AssetPlane = 'custodial' | 'sovereign';

/** One readable holding. Weight is a decimal string in [0,1] supplied by the view. */
export type PortfolioHolding = {
  readonly asset: string;
  readonly plane: AssetPlane;
  readonly weight: string;
};

/** Named unread — not a zero row. */
export type UnreadHolding = {
  readonly asset: string;
  readonly plane: AssetPlane | 'unknown';
  readonly reason: string;
};

export type PortfolioSnapshot = {
  readonly holdings: readonly PortfolioHolding[];
  readonly unread: readonly UnreadHolding[];
};

export type PortfolioPort = {
  read(userId: string): PortfolioSnapshot;
};

export type TargetWeight = {
  readonly asset: string;
  readonly plane: AssetPlane;
  /** Owner-supplied decimal string in [0,1]. Never invented by this agent. */
  readonly weight: string;
};
