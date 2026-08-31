/**
 * execution.market-making named quote-group cancel — PX-S08 / PTX-M11-R05.
 *
 * Cancels one caller-named quote set for one maker. Does not submit to matching
 * and does not flatten positions. A missing group name refuses — never cancel-all.
 */

export type MmLiveQuote = Readonly<{
  makerId: string;
  quoteSetId: string;
  quoteId: string;
  symbol: string;
}>;

export type MmCancelQuoteGroupInput = Readonly<{
  makerId: string;
  /** Named quote group. Empty refuses — never treated as cancel-all. */
  quoteSetId: string;
  liveQuotes: readonly MmLiveQuote[];
}>;

export type MmCancelQuoteGroupRefuseReason = 'quote_set_id_missing' | 'maker_id_missing';

export type MmCancelQuoteGroupRefusal = {
  readonly ok: false;
  readonly reason: MmCancelQuoteGroupRefuseReason;
  readonly detail: string;
};

export type MmCancelQuoteGroupAccepted = {
  readonly ok: true;
  readonly makerId: string;
  readonly quoteSetId: string;
  readonly cancelled: readonly MmLiveQuote[];
  readonly leftStanding: readonly MmLiveQuote[];
};

export type MmCancelQuoteGroupResult = MmCancelQuoteGroupAccepted | MmCancelQuoteGroupRefusal;

function refuse(reason: MmCancelQuoteGroupRefuseReason, detail: string): MmCancelQuoteGroupRefusal {
  return { ok: false, reason, detail };
}

/**
 * Plan cancel of one named quote group for one maker.
 *
 * Other groups (and other makers) stay in `leftStanding`. Empty live set with a
 * named group is an empty cancel — not a book wipe.
 */
export function cancelQuoteGroupExternalMm(input: MmCancelQuoteGroupInput): MmCancelQuoteGroupResult {
  const quoteSetId = input.quoteSetId.trim();
  if (quoteSetId.length === 0) {
    return refuse('quote_set_id_missing', 'quote group name is required — cancel-all is not the default');
  }
  const makerId = input.makerId.trim();
  if (makerId.length === 0) {
    return refuse('maker_id_missing', 'makerId is required — cancel-group does not invent an owner');
  }

  const cancelled: MmLiveQuote[] = [];
  const leftStanding: MmLiveQuote[] = [];
  for (const quote of input.liveQuotes) {
    if (quote.makerId.trim() === makerId && quote.quoteSetId.trim() === quoteSetId) {
      cancelled.push(quote);
    } else {
      leftStanding.push(quote);
    }
  }

  return { ok: true, makerId, quoteSetId, cancelled, leftStanding };
}
