import type postgres from 'postgres';

export type CopyLeaderFixture = {
  readonly leaderId: string;
  readonly realisedPnl: string | null;
  readonly closedTrades: number | null;
  readonly winningTrades: number | null;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly source: string;
};

export type CopyLeaderFixturesStore = {
  listFixtures(): Promise<readonly CopyLeaderFixture[]>;
  publishFixture(fixture: CopyLeaderFixture): Promise<void>;
};

type FixtureRow = {
  leader_id: string;
  realised_pnl: string | null;
  closed_trades: number | null;
  winning_trades: number | null;
  window_start: Date;
  window_end: Date;
  source: string;
};

function rowToFixture(row: FixtureRow): CopyLeaderFixture {
  return {
    leaderId: row.leader_id,
    realisedPnl: row.realised_pnl,
    closedTrades: row.closed_trades,
    winningTrades: row.winning_trades,
    windowStart: row.window_start.toISOString(),
    windowEnd: row.window_end.toISOString(),
    source: row.source,
  };
}

export function createCopyLeaderFixturesStore(sql: postgres.Sql): CopyLeaderFixturesStore {
  return {
    async listFixtures() {
      const rows = await sql<FixtureRow[]>`
        SELECT leader_id, realised_pnl, closed_trades, winning_trades, window_start, window_end, source
        FROM trade.copy_leader_fixtures
        ORDER BY leader_id
      `;
      return rows.map(rowToFixture);
    },
    async publishFixture(fixture) {
      await sql`
        INSERT INTO trade.copy_leader_fixtures (
          leader_id, realised_pnl, closed_trades, winning_trades, window_start, window_end, source
        )
        VALUES (
          ${fixture.leaderId},
          ${fixture.realisedPnl},
          ${fixture.closedTrades},
          ${fixture.winningTrades},
          ${fixture.windowStart}::timestamptz,
          ${fixture.windowEnd}::timestamptz,
          ${fixture.source}
        )
        ON CONFLICT (leader_id) DO UPDATE SET
          realised_pnl = EXCLUDED.realised_pnl,
          closed_trades = EXCLUDED.closed_trades,
          winning_trades = EXCLUDED.winning_trades,
          window_start = EXCLUDED.window_start,
          window_end = EXCLUDED.window_end,
          source = EXCLUDED.source,
          published_at = now()
      `;
    },
  };
}
