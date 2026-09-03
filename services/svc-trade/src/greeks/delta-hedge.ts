/**
 * CARD R-E6 — auto delta-hedge refuse when target/range/instrument unset.
 *
 * PX-S08-O11 / PTX-M11-R09. Independent of MMP remaining-size hedge.
 * Do not invent MMP or delta numbers. Owner sockets are decimal strings.
 * This door does not list a live option and does not post.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';

export const DELTA_HEDGE_PATH = '/api/v1/greeks/delta-hedge' as const;

export const DELTA_HEDGE_TARGET_ENV = 'TRADE_DELTA_HEDGE_TARGET' as const;
export const DELTA_HEDGE_RANGE_ENV = 'TRADE_DELTA_HEDGE_RANGE' as const;
export const DELTA_HEDGE_INSTRUMENT_ENV = 'TRADE_DELTA_HEDGE_INSTRUMENT' as const;

export const DELTA_HEDGE_TARGET_UNSET = 'trade.delta_hedge_target_unset' as const;
export const DELTA_HEDGE_RANGE_UNSET = 'trade.delta_hedge_range_unset' as const;
export const DELTA_HEDGE_INSTRUMENT_UNSET = 'trade.delta_hedge_instrument_unset' as const;
export const DELTA_HEDGE_IEEE = 'trade.delta_hedge_ieee' as const;

export type DeltaHedgeRefuseCode =
  typeof DELTA_HEDGE_TARGET_UNSET | typeof DELTA_HEDGE_RANGE_UNSET | typeof DELTA_HEDGE_INSTRUMENT_UNSET | typeof DELTA_HEDGE_IEEE;

export type AutoDeltaHedgeOk = {
  readonly ok: true;
  readonly preview: true;
  readonly executed: false;
  readonly orders: readonly [];
  readonly target: string;
  readonly range: string;
  readonly instrument: string;
};

export type AutoDeltaHedgeRefuse = {
  readonly ok: false;
  readonly code: DeltaHedgeRefuseCode;
  readonly reason: string;
  readonly executed: false;
  readonly orders: readonly [];
};

export type AutoDeltaHedgeResult = AutoDeltaHedgeOk | AutoDeltaHedgeRefuse;

export type AutoDeltaHedgeInput = {
  readonly target?: unknown;
  readonly range?: unknown;
  readonly instrument?: unknown;
  /** Must never be invoked — auto hedge does not post while this mill is refuse/preview. */
  readonly post?: (recipe: unknown) => Promise<unknown>;
};

function present(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  return true;
}

function ieeeOnWire(raw: unknown): boolean {
  return typeof raw === 'number';
}

function ownerDecimal(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    return formatAmount(parseAmount(raw.trim()));
  } catch {
    return null;
  }
}

function ownerInstrument(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function readOwnerDeltaHedgeTarget(env: NodeJS.ProcessEnv = process.env): unknown {
  return env[DELTA_HEDGE_TARGET_ENV];
}

export function readOwnerDeltaHedgeRange(env: NodeJS.ProcessEnv = process.env): unknown {
  return env[DELTA_HEDGE_RANGE_ENV];
}

export function readOwnerDeltaHedgeInstrument(env: NodeJS.ProcessEnv = process.env): unknown {
  return env[DELTA_HEDGE_INSTRUMENT_ENV];
}

function pickSocket(input: unknown, fromEnv: unknown): unknown {
  return present(input) ? input : fromEnv;
}

/**
 * Auto delta-hedge admission. Blank owner target/range/instrument refuses
 * by name. Never invents a delta, MMP threshold, or hedge size. Preview
 * only — no child orders.
 */
export function checkAutoDeltaHedge(input: AutoDeltaHedgeInput = {}): AutoDeltaHedgeResult {
  void input.post;

  const targetRaw = pickSocket(input.target, readOwnerDeltaHedgeTarget());
  if (ieeeOnWire(targetRaw)) {
    return {
      ok: false,
      code: DELTA_HEDGE_IEEE,
      reason: 'TRADE_DELTA_HEDGE_TARGET must be a decimal string — IEEE number refused on the wire',
      executed: false,
      orders: [],
    };
  }
  if (!present(targetRaw)) {
    return {
      ok: false,
      code: DELTA_HEDGE_TARGET_UNSET,
      reason: 'TRADE_DELTA_HEDGE_TARGET is unset — refuse auto delta-hedge rather than invent a target',
      executed: false,
      orders: [],
    };
  }
  const target = ownerDecimal(targetRaw);
  if (target == null) {
    return {
      ok: false,
      code: DELTA_HEDGE_TARGET_UNSET,
      reason: 'TRADE_DELTA_HEDGE_TARGET is unset — refuse auto delta-hedge rather than invent a target',
      executed: false,
      orders: [],
    };
  }

  const rangeRaw = pickSocket(input.range, readOwnerDeltaHedgeRange());
  if (ieeeOnWire(rangeRaw)) {
    return {
      ok: false,
      code: DELTA_HEDGE_IEEE,
      reason: 'TRADE_DELTA_HEDGE_RANGE must be a decimal string — IEEE number refused on the wire',
      executed: false,
      orders: [],
    };
  }
  if (!present(rangeRaw)) {
    return {
      ok: false,
      code: DELTA_HEDGE_RANGE_UNSET,
      reason: 'TRADE_DELTA_HEDGE_RANGE is unset — refuse auto delta-hedge rather than invent a range',
      executed: false,
      orders: [],
    };
  }
  const range = ownerDecimal(rangeRaw);
  if (range == null) {
    return {
      ok: false,
      code: DELTA_HEDGE_RANGE_UNSET,
      reason: 'TRADE_DELTA_HEDGE_RANGE is unset — refuse auto delta-hedge rather than invent a range',
      executed: false,
      orders: [],
    };
  }

  const instrumentRaw = pickSocket(input.instrument, readOwnerDeltaHedgeInstrument());
  const instrument = ownerInstrument(instrumentRaw);
  if (instrument == null) {
    return {
      ok: false,
      code: DELTA_HEDGE_INSTRUMENT_UNSET,
      reason: 'TRADE_DELTA_HEDGE_INSTRUMENT is unset — refuse auto delta-hedge rather than invent a hedge instrument',
      executed: false,
      orders: [],
    };
  }

  return {
    ok: true,
    preview: true,
    executed: false,
    orders: [],
    target,
    range,
    instrument,
  };
}

/**
 * Live auto-hedge door. Refuses before any ledger post. Never places a
 * child order. Never lists an option. Does not fold MMP hedge.
 */
export async function runAutoDeltaHedge(input: AutoDeltaHedgeInput = {}): Promise<AutoDeltaHedgeResult> {
  const check = checkAutoDeltaHedge(input);
  void input.post;
  return check;
}
