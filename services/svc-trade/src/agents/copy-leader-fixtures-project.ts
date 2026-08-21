import type postgres from 'postgres';
import type { CopyLeaderFixture } from './copy-leader-fixtures-store.js';

/** Rolling window for mirrored-fill fixture projection (30d). */
export const COPY_LEADER_FIXTURES_PROJECT_WINDOW_MS = 2_592_000_000 as const;

export const COPY_LEADER_FIXTURES_MIRRORED_SOURCE = 'trade.copy.mirrored_fills' as const;

type MirroredAggRow = {
  leader_id: string;
  closed_trades: number;
  window_start: Date;
  window_end: Date;
};

/**
 * Partial leader fixtures from durable mirrored fills — PnL and win rate stay
 * null (unknown), never invented §8 magnitudes.
 */
export async function listProjectedCopyLeaderFixtures(
  sql: postgres.Sql,
  windowMs: number = COPY_LEADER_FIXTURES_PROJECT_WINDOW_MS,
): Promise<readonly CopyLeaderFixture[]> {
  const rows = await sql<MirroredAggRow[]>`
    SELECT
      leader_id,
      COUNT(*)::int AS closed_trades,
      MIN(created_at) AS window_start,
      MAX(created_at) AS window_end
    FROM trade.copy_mirrored_fills
    WHERE created_at >= now() - (${windowMs} * interval '1 millisecond')
    GROUP BY leader_id
    HAVING COUNT(*) > 0
    ORDER BY leader_id
  `;

  return rows.map((row) => ({
    leaderId: row.leader_id,
    realisedPnl: null,
    closedTrades: row.closed_trades,
    winningTrades: null,
    windowStart: row.window_start.toISOString(),
    windowEnd: row.window_end.toISOString(),
    source: COPY_LEADER_FIXTURES_MIRRORED_SOURCE,
  }));
}
