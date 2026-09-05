/**
 * Market Scanner Stage-1 — rank on fixtures only.
 *
 * Spec: docs/ops/trk/agents.scanner.md Stage 1.
 * Honesty: D26-P1-A3 / D26-P0-11 — ranked signals only after signal-inputs
 * law is sealed; else refuse (never invent ranking / market alpha).
 *
 * Rules:
 *   · P0-11 signal-inputs law must be sealed before any score is computed.
 *   · Input is caller-supplied fixture rows — never invented mid-function.
 *   · Missing/null quotes are refused, not filled with 0 or "placeholder" prices.
 *   · Stale rows (asOf older than maxAgeMs vs `now`) are dropped; if nothing
 *     remains, status is unavailable, not an empty green list.
 *   · Score is a relative rank key (string decimal), not a balance or quote.
 *   · last / volume24h are money strings: parse via ledger-client, never JS Number.
 *   · No model call, no ledger post, no auto-trade.
 */

import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import {
  SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
  resolveScannerSignalInputsLaw,
  scannerSignalInputsGate,
  type ScannerSignalInputsGateRefuseReason,
  type ScannerSignalInputsLaw,
} from './signal-inputs-law.js';

export type MarketFixture = {
  readonly marketId: string;
  /** Last trade / mid as decimal string. null = no quote. */
  readonly last: string | null;
  /** 24h volume as decimal string. null = unknown. */
  readonly volume24h: string | null;
  /** 24h change in basis points. null = unknown. */
  readonly change24hBps: number | null;
  /** Observation time (ISO-8601). */
  readonly asOf: string;
  /** Max age of this row in ms for the rank call. */
  readonly maxAgeMs: number;
};

export type RankedSignal = {
  readonly marketId: string;
  /** Relative score as decimal string (higher = stronger absolute move × volume weight). */
  readonly score: string;
  readonly reasons: readonly string[];
};

export type RankOk = {
  readonly status: 'ok';
  readonly signals: readonly RankedSignal[];
  readonly rankedAt: string;
  readonly considered: number;
  readonly skippedStale: number;
  readonly skippedIncomplete: number;
};

export type RankEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.scanner.empty';
};

export type RankUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.scanner.unavailable';
  readonly reason: 'stale' | 'no_quotes' | 'market_plane_dark';
};

/** D26-P1-A3 — P0-11 not sealed (or sealed incompletely). No ranked signals. */
export type RankRefuse = {
  readonly status: 'refuse';
  readonly reason: ScannerSignalInputsGateRefuseReason;
  readonly userMessageKey: 'agents.scanner.tier_closed' | 'agents.scanner.signal_inputs_closed';
  readonly residual: typeof SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL;
};

export type RankResult = RankOk | RankEmpty | RankUnavailable | RankRefuse;

/** Stage-2: live market data plane. Dark → refuse invent signals. */
export type MarketPlaneState = 'live' | 'dark';

/** Signed decimal money; null if unusable (refuse invent). */
function parseSignedAmount(s: string): Amount | null {
  try {
    return parseAmount(s);
  } catch {
    return null;
  }
}

/**
 * Sealed recipe `abs_change_x_log_volume`: IEEE log1p of the decimal volume.
 * Rank key only — never a book. Volume memory is bigint.
 */
function log1pVolumeWeight(vol: Amount): number | null {
  if (vol < 0n) return null;
  const rankWeight = Number(formatAmount(vol));
  if (!Number.isFinite(rankWeight) || rankWeight < 0) return null;
  return Math.log1p(rankWeight);
}

function isFresh(asOf: string, maxAgeMs: number, nowMs: number): boolean {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= maxAgeMs && nowMs - t >= 0;
}

/**
 * Stage-2 L3: optional allowlist of market ids the scanner may consider.
 * Empty/missing allowlist → all fixtures (caller already scoped).
 * Non-empty → only listed markets; others count as incomplete (not invent ghost ranks).
 */
export function filterFixturesByAllowlist(
  fixtures: readonly MarketFixture[],
  allowlist: ReadonlySet<string> | readonly string[] | undefined,
): { readonly kept: readonly MarketFixture[]; readonly skippedNotAllowed: number } {
  if (!allowlist) return { kept: fixtures, skippedNotAllowed: 0 };
  const set = allowlist instanceof Set ? allowlist : new Set(allowlist);
  if (set.size === 0) return { kept: fixtures, skippedNotAllowed: 0 };
  const kept: MarketFixture[] = [];
  let skippedNotAllowed = 0;
  for (const row of fixtures) {
    if (set.has(row.marketId)) kept.push(row);
    else skippedNotAllowed += 1;
  }
  return { kept, skippedNotAllowed };
}

/**
 * Rank fixture markets by |changeBps| × log1p(volume) when both present and fresh.
 * Incomplete rows are skipped; never zero-filled.
 *
 * Requires sealed D26-P0-11 signal-inputs law (recipe `abs_change_x_log_volume`).
 * Blank / unpublished law → typed refuse — never invent rankings.
 */
export function rankFixtures(
  fixtures: readonly MarketFixture[],
  options: {
    now?: Date;
    limit?: number;
    marketPlane?: MarketPlaneState;
    /** Stage-2: only rank these market ids when provided and non-empty. */
    marketAllowlist?: ReadonlySet<string> | readonly string[];
    /**
     * D26-P0-11 signal-inputs law. Omitted / null / unpublished → refuse-closed
     * (`signal_inputs_law_blank`). Never sneak a default ranked board.
     */
    signalInputsLaw?: ScannerSignalInputsLaw | null;
  } = {},
): RankResult {
  const inputsGate = scannerSignalInputsGate(resolveScannerSignalInputsLaw(options.signalInputsLaw));
  if (inputsGate.status === 'refuse') {
    return {
      status: 'refuse',
      reason: inputsGate.reason,
      userMessageKey: inputsGate.userMessageKey,
      residual: inputsGate.residual,
    };
  }

  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const limit = options.limit ?? 20;
  if (options.marketPlane === 'dark') {
    return { status: 'unavailable', userMessageKey: 'agents.scanner.unavailable', reason: 'market_plane_dark' };
  }

  const { kept: scoped, skippedNotAllowed } = filterFixturesByAllowlist(fixtures, options.marketAllowlist);

  if (scoped.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.scanner.empty' };
  }

  let skippedStale = 0;
  let skippedIncomplete = skippedNotAllowed;
  const candidates: { marketId: string; score: number; reasons: string[] }[] = [];

  for (const row of scoped) {
    if (!row.marketId) {
      skippedIncomplete += 1;
      continue;
    }
    if (!isFresh(row.asOf, row.maxAgeMs, nowMs)) {
      skippedStale += 1;
      continue;
    }
    if (row.last == null || row.volume24h == null || row.change24hBps == null) {
      skippedIncomplete += 1;
      continue;
    }
    const last = parseSignedAmount(row.last);
    const vol = parseSignedAmount(row.volume24h);
    const volWeight = vol == null ? null : log1pVolumeWeight(vol);
    if (last == null || vol == null || volWeight == null) {
      skippedIncomplete += 1;
      continue;
    }

    const absBps = Math.abs(row.change24hBps);
    // log1p volume dampens huge books without inventing a "price".
    const score = absBps * volWeight;
    const reasons: string[] = [];
    if (absBps > 0) {
      reasons.push(row.change24hBps >= 0 ? 'change_up' : 'change_down');
    } else {
      reasons.push('change_flat');
    }
    if (vol > 0n) reasons.push('has_volume');
    candidates.push({ marketId: row.marketId, score, reasons });
  }

  if (candidates.length === 0) {
    if (skippedStale > 0 && skippedIncomplete === 0) {
      return { status: 'unavailable', userMessageKey: 'agents.scanner.unavailable', reason: 'stale' };
    }
    if (skippedIncomplete > 0 || skippedStale > 0) {
      return { status: 'unavailable', userMessageKey: 'agents.scanner.unavailable', reason: 'no_quotes' };
    }
    return { status: 'empty', userMessageKey: 'agents.scanner.empty' };
  }

  candidates.sort((a, b) => b.score - a.score || a.marketId.localeCompare(b.marketId));
  const top = candidates.slice(0, limit);

  return {
    status: 'ok',
    rankedAt: now.toISOString(),
    considered: scoped.length + skippedNotAllowed,
    skippedStale,
    skippedIncomplete,
    signals: top.map((c) => ({
      marketId: c.marketId,
      // Fixed precision string — relative rank key, not money.
      score: c.score.toFixed(6),
      reasons: c.reasons,
    })),
  };
}
