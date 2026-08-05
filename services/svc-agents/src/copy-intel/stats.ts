/**
 * Copy-Intel Stage-1 — audited leader stats from fixtures only.
 *
 * Spec: docs/ops/trk/agents.copy-intel.md Stage 1.
 *
 * Rules:
 *   · Stats are computed from caller-supplied leader performance rows.
 *   · Never invents PnL, win rate, or follower counts.
 *   · Writes produce an audit record shape (in-memory Stage-1) with provenance.
 *   · No trade placement, no ledger, no profit-share — trade.copy product law residual.
 */

export type LeaderPerformanceFixture = {
  readonly leaderId: string;
  /** Realised PnL as decimal string (can be negative). null = unknown. */
  readonly realisedPnl: string | null;
  /** Closed trades in window. null = unknown. */
  readonly closedTrades: number | null;
  /** Winning closed trades. null = unknown. */
  readonly winningTrades: number | null;
  /** Window start ISO. */
  readonly windowStart: string;
  /** Window end ISO. */
  readonly windowEnd: string;
  /** Source system id for provenance (platform-owned name, not a vendor). */
  readonly source: string;
};

export type LeaderStat = {
  readonly leaderId: string;
  readonly realisedPnl: string;
  readonly closedTrades: number;
  readonly winRate: string;
  readonly windowStart: string;
  readonly windowEnd: string;
};

export type AuditWrite = {
  readonly id: string;
  readonly writtenAt: string;
  readonly source: string;
  readonly leaderId: string;
  readonly stat: LeaderStat;
  readonly provenance: {
    readonly fixture: true;
    readonly source: string;
    readonly windowStart: string;
    readonly windowEnd: string;
  };
};

export type IntelOk = {
  readonly status: 'ok';
  readonly stats: readonly LeaderStat[];
  readonly audit: readonly AuditWrite[];
  readonly skippedIncomplete: number;
};

export type IntelEmpty = {
  readonly status: 'empty';
  readonly userMessageKey: 'agents.copy_intel.empty';
};

export type IntelUnavailable = {
  readonly status: 'unavailable';
  readonly userMessageKey: 'agents.copy_intel.unavailable';
  readonly reason: 'no_data' | 'invalid_window' | 'copy_plane_dark';
};

export type IntelResult = IntelOk | IntelEmpty | IntelUnavailable;

/** Stage-2: trade.copy product plane. Dark → refuse invent PnL. */
export type CopyPlaneState = 'live' | 'dark';

function parseDecimal(s: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function winRate(closed: number, winning: number): string | null {
  if (closed <= 0) return '0.0000';
  if (winning < 0 || winning > closed) return null;
  return (winning / closed).toFixed(4);
}

/**
 * Build audited leader stats from fixtures. Incomplete rows are skipped;
 * empty input → empty; all incomplete → unavailable (never invent green leaders).
 */
export function buildLeaderStats(
  fixtures: readonly LeaderPerformanceFixture[],
  options: { now?: Date; idPrefix?: string; copyPlane?: CopyPlaneState } = {},
): IntelResult {
  const now = options.now ?? new Date();
  const idPrefix = options.idPrefix ?? 'ci';
  if (options.copyPlane === 'dark') {
    return { status: 'unavailable', userMessageKey: 'agents.copy_intel.unavailable', reason: 'copy_plane_dark' };
  }

  if (fixtures.length === 0) {
    return { status: 'empty', userMessageKey: 'agents.copy_intel.empty' };
  }

  let skippedIncomplete = 0;
  const stats: LeaderStat[] = [];
  const audit: AuditWrite[] = [];
  let seq = 0;

  for (const row of fixtures) {
    if (!row.leaderId || !row.source) {
      skippedIncomplete += 1;
      continue;
    }
    const ws = Date.parse(row.windowStart);
    const we = Date.parse(row.windowEnd);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we < ws) {
      return { status: 'unavailable', userMessageKey: 'agents.copy_intel.unavailable', reason: 'invalid_window' };
    }
    if (row.realisedPnl == null || row.closedTrades == null || row.winningTrades == null) {
      skippedIncomplete += 1;
      continue;
    }
    if (!Number.isInteger(row.closedTrades) || !Number.isInteger(row.winningTrades)) {
      skippedIncomplete += 1;
      continue;
    }
    const pnl = parseDecimal(row.realisedPnl);
    if (pnl == null) {
      skippedIncomplete += 1;
      continue;
    }
    const wr = winRate(row.closedTrades, row.winningTrades);
    if (wr == null) {
      skippedIncomplete += 1;
      continue;
    }

    const stat: LeaderStat = {
      leaderId: row.leaderId,
      realisedPnl: row.realisedPnl,
      closedTrades: row.closedTrades,
      winRate: wr,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
    };
    stats.push(stat);
    seq += 1;
    audit.push({
      id: `${idPrefix}-${seq}`,
      writtenAt: now.toISOString(),
      source: row.source,
      leaderId: row.leaderId,
      stat,
      provenance: {
        fixture: true,
        source: row.source,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
      },
    });
  }

  if (stats.length === 0) {
    return { status: 'unavailable', userMessageKey: 'agents.copy_intel.unavailable', reason: 'no_data' };
  }

  return { status: 'ok', stats, audit, skippedIncomplete };
}
