/**
 * Market Scanner Stage-1 — rank on fixtures only.
 *
 * Spec: docs/ops/trk/agents.scanner.md Stage 1.
 *
 * Rules:
 *   · Input is caller-supplied fixture rows — never invented mid-function.
 *   · Missing/null quotes are refused, not filled with 0 or "placeholder" prices.
 *   · Stale rows (asOf older than maxAgeMs vs `now`) are dropped; if nothing
 *     remains, status is unavailable, not an empty green list.
 *   · Score is a relative rank key (string decimal), not a balance or quote.
 *   · No model call, no ledger, no auto-trade.
 */

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
  readonly reason: 'stale' | 'no_quotes';
};

export type RankResult = RankOk | RankEmpty | RankUnavailable;

function parseDecimal(s: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isFresh(asOf: string, maxAgeMs: number, nowMs: number): boolean {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= maxAgeMs && nowMs - t >= 0;
}

/**
 * Rank fixture markets by |changeBps| × log1p(volume) when both present and fresh.
 * Incomplete rows are skipped; never zero-filled.
 */
export function rankFixtures(fixtures: readonly MarketFixture[], options: { now?: Date; limit?: number } = {}): RankResult {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const limit = options.limit ?? 20;

  if (fixtures.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.scanner.empty' };
  }

  let skippedStale = 0;
  let skippedIncomplete = 0;
  const candidates: { marketId: string; score: number; reasons: string[] }[] = [];

  for (const row of fixtures) {
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
    const last = parseDecimal(row.last);
    const vol = parseDecimal(row.volume24h);
    if (last == null || vol == null || vol < 0) {
      skippedIncomplete += 1;
      continue;
    }

    const absBps = Math.abs(row.change24hBps);
    // log1p volume dampens huge books without inventing a "price".
    const score = absBps * Math.log1p(vol);
    const reasons: string[] = [];
    if (absBps > 0) {
      reasons.push(row.change24hBps >= 0 ? 'change_up' : 'change_down');
    } else {
      reasons.push('change_flat');
    }
    if (vol > 0) reasons.push('has_volume');
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
    considered: fixtures.length,
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
