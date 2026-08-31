/**
 * execution.market-making mass quote — PX-S08/PX-S10 / Deribit-pattern IDs.
 *
 * Plans a multi-instrument two-sided quote set. Does not submit to matching
 * and does not invent mids, sizes, MMP magnitudes, or freeze clocks.
 * Unset owner MMP thresholds refuse the whole set (no quote-storm race).
 */
import { quoteExternalMm, type MmQuoteAccepted, type MmRefuseReason, type QuoteExternalMmInput } from './market-making.js';
import {
  runMmMmpAction,
  type MmMmpActionRefusal,
  type MmMmpObservation,
  type MmMmpThresholds,
  type MmMmpThresholdsRefuseReason,
} from './mm-mmp-thresholds.js';
import { mmSpreadSkewBandsGate, validateMmOwnerSpreadSkew, type MmSpreadSkewBandsRefuseReason } from './mm-spread-skew-bands.js';

export type MmMassQuoteEntry = Readonly<{
  quoteSetId: string;
  quote: QuoteExternalMmInput;
}>;

export type MmMassQuoteInput = Readonly<{
  /** Mass-quote message id. Empty refuses — not invented. */
  quoteId: string;
  /** MMP group. Empty refuses — no default group. */
  mmpGroup: string;
  /** Cancel-on-disconnect must be on; false refuses the set. */
  cancelOnDisconnect: boolean;
  /** Caller-supplied freeze. True refuses quoting; clocks are not invented here. */
  frozen: boolean;
  /**
   * Optional matching-engine deadline (ms). When set, `nowMs` is required;
   * a missing clock refuses rather than inventing server time.
   */
  validUntilMs: number | null;
  nowMs: number | null;
  observation: MmMmpObservation;
  /** Caller-measured window; must equal owner observationWindowMs. */
  observationWindowMs: number;
  entries: readonly MmMassQuoteEntry[];
}>;

export type MmMassQuoteSetRefuseReason =
  | MmMmpThresholdsRefuseReason
  | 'mmp_observation_incomplete'
  | 'mmp_triggered'
  | 'mmp_frozen'
  | 'mmp_group_missing'
  | 'quote_id_missing'
  | 'cancel_on_disconnect_required'
  | 'empty_quotes'
  | 'instrument_missing'
  | 'duplicate_instrument'
  | 'mmp_open_quotes_exceeded'
  | 'valid_until_clock_unknown'
  | 'timed_out'
  | Extract<MmSpreadSkewBandsRefuseReason, 'bands_unset' | 'bands_invalid_json' | 'bands_incomplete'>;

export type MmMassQuoteSetRefusal = {
  readonly ok: false;
  readonly reason: MmMassQuoteSetRefuseReason;
  readonly detail: string;
};

export type MmMassQuoteEntryOutcome =
  | {
      readonly ok: true;
      readonly quoteId: string;
      readonly quoteSetId: string;
      readonly mmpGroup: string;
      readonly quote: MmQuoteAccepted;
    }
  | {
      readonly ok: false;
      readonly quoteId: string;
      readonly quoteSetId: string;
      readonly mmpGroup: string;
      readonly reason: MmRefuseReason | MmSpreadSkewBandsRefuseReason;
      readonly detail: string;
    };

export type MmMassQuoteAccepted = {
  readonly ok: true;
  readonly quoteId: string;
  readonly mmpGroup: string;
  readonly thresholds: MmMmpThresholds;
  readonly entries: readonly MmMassQuoteEntryOutcome[];
};

export type MmMassQuoteResult = MmMassQuoteAccepted | MmMassQuoteSetRefusal;

function setRefuse(reason: MmMassQuoteSetRefuseReason, detail: string): MmMassQuoteSetRefusal {
  return { ok: false, reason, detail };
}

function mmpSetRefuse(result: MmMmpActionRefusal): MmMassQuoteSetRefusal {
  return { ok: false, reason: result.reason, detail: result.detail };
}

/**
 * Plan an external-only mass quote set.
 *
 * Set-level MMP / COD / freeze / window checks run first. Surviving entries
 * get per-entry quote outcomes — a missing mid on one instrument does not
 * invent a price for the rest.
 */
export function massQuoteExternalMm(input: MmMassQuoteInput, env: NodeJS.ProcessEnv = process.env): MmMassQuoteResult {
  const quoteId = input.quoteId.trim();
  if (quoteId.length === 0) {
    return setRefuse('quote_id_missing', 'mass quote quoteId is required — not invented');
  }
  const mmpGroup = input.mmpGroup.trim();
  if (mmpGroup.length === 0) {
    return setRefuse('mmp_group_missing', 'mass quote mmpGroup is required — no default group');
  }
  if (!input.cancelOnDisconnect) {
    return setRefuse('cancel_on_disconnect_required', 'mass quote requires cancel-on-disconnect — session COD is not invented');
  }
  if (input.frozen) {
    return setRefuse('mmp_frozen', 'mass quote fenced — MMP freeze is active until owner reset');
  }
  if (input.validUntilMs !== null) {
    if (input.nowMs === null || !Number.isInteger(input.nowMs) || input.nowMs < 0) {
      return setRefuse('valid_until_clock_unknown', 'validUntilMs set but nowMs unknown — refuse rather than invent server time');
    }
    if (!Number.isInteger(input.validUntilMs) || input.validUntilMs < 0) {
      return setRefuse('timed_out', 'validUntilMs must be a non-negative integer timestamp');
    }
    if (input.nowMs > input.validUntilMs) {
      return setRefuse('timed_out', 'mass quote validUntilMs elapsed — matching not invented');
    }
  }
  if (input.entries.length === 0) {
    return setRefuse('empty_quotes', 'mass quote entries empty — no quotes invented');
  }

  const mmp = runMmMmpAction('mass_quote', env, input.observation);
  if (!mmp.ok) return mmpSetRefuse(mmp);

  if (!Number.isInteger(input.observationWindowMs) || input.observationWindowMs !== mmp.thresholds.observationWindowMs) {
    return setRefuse(
      'mmp_observation_incomplete',
      `observationWindowMs ${input.observationWindowMs} does not match owner ${mmp.thresholds.observationWindowMs} — window not stretched`,
    );
  }

  const bands = mmSpreadSkewBandsGate(env);
  if (!bands.configured) {
    const reason = bands.reason;
    if (reason !== 'bands_unset' && reason !== 'bands_invalid_json' && reason !== 'bands_incomplete') {
      return setRefuse('bands_incomplete', `mass quote disabled — ${bands.detail}`);
    }
    return setRefuse(reason, `mass quote disabled — ${bands.detail}`);
  }

  const seenInstruments = new Set<string>();
  for (const entry of input.entries) {
    const symbol = entry.quote.symbol.trim();
    if (symbol.length === 0) {
      return setRefuse('instrument_missing', 'mass quote symbol empty — instrument identity not invented');
    }
    const key = `${mmpGroup}\0${symbol}`;
    if (seenInstruments.has(key)) {
      return setRefuse('duplicate_instrument', `only one quote per instrument per MMP group — duplicate ${symbol} in ${mmpGroup}`);
    }
    seenInstruments.add(key);
  }

  // Two-sided quote = bid + ask. Do not invent a one-sided collapse.
  const projectedOpen = input.observation.openQuotes + input.entries.length * 2;
  if (projectedOpen > mmp.thresholds.maxOpenQuotes) {
    return setRefuse(
      'mmp_open_quotes_exceeded',
      `openQuotes ${input.observation.openQuotes} + ${input.entries.length * 2} would exceed owner maxOpenQuotes ${mmp.thresholds.maxOpenQuotes}`,
    );
  }

  const outcomes: MmMassQuoteEntryOutcome[] = [];
  for (const entry of input.entries) {
    const quoteSetId = entry.quoteSetId.trim();
    if (quoteSetId.length === 0) {
      outcomes.push({
        ok: false,
        quoteId,
        quoteSetId: entry.quoteSetId,
        mmpGroup,
        reason: 'invalid_owner_params',
        detail: 'quoteSetId is required — not invented',
      });
      continue;
    }

    const band = validateMmOwnerSpreadSkew(bands.bands, entry.quote.halfSpreadBps, entry.quote.inventorySkewBps);
    if (!band.ok) {
      outcomes.push({
        ok: false,
        quoteId,
        quoteSetId,
        mmpGroup,
        reason: band.reason,
        detail: band.detail,
      });
      continue;
    }

    const quoted = quoteExternalMm(entry.quote);
    if (!quoted.ok) {
      outcomes.push({
        ok: false,
        quoteId,
        quoteSetId,
        mmpGroup,
        reason: quoted.reason,
        detail: quoted.detail,
      });
      continue;
    }

    outcomes.push({
      ok: true,
      quoteId,
      quoteSetId,
      mmpGroup,
      quote: quoted,
    });
  }

  return {
    ok: true,
    quoteId,
    mmpGroup,
    thresholds: mmp.thresholds,
    entries: outcomes,
  };
}
