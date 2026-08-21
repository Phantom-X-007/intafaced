import type postgres from 'postgres';
import type { MerchantWatchMetricsOk } from './merchant-watch-metrics-routes.js';
import { listProjectedPayMetrics } from './merchant-watch-metrics-project.js';

export type MerchantWatchMetricPoint = MerchantWatchMetricsOk['points'][number];

export type MerchantWatchMetricsStore = {
  listPoints(): Promise<readonly MerchantWatchMetricPoint[]>;
  publishPoint(point: MerchantWatchMetricPoint): Promise<void>;
};

type MetricsRow = {
  rail_id: string;
  approval_rate: string | null;
  attempts: number | null;
  as_of: Date;
  max_age_ms: number;
};

function rowToPoint(row: MetricsRow): MerchantWatchMetricPoint {
  return {
    railId: row.rail_id,
    approvalRate: row.approval_rate,
    attempts: row.attempts,
    asOf: row.as_of.toISOString(),
    maxAgeMs: row.max_age_ms,
  };
}

export function createMerchantWatchMetricsStore(sql: postgres.Sql): MerchantWatchMetricsStore {
  return {
    async listPoints() {
      const rows = await sql<MetricsRow[]>`
        SELECT rail_id, approval_rate, attempts, as_of, max_age_ms
        FROM pay.merchant_watch_metrics
        ORDER BY rail_id
      `;
      if (rows.length > 0) return rows.map(rowToPoint);
      return listProjectedPayMetrics(sql);
    },
    async publishPoint(point) {
      await sql`
        INSERT INTO pay.merchant_watch_metrics (rail_id, approval_rate, attempts, as_of, max_age_ms)
        VALUES (
          ${point.railId},
          ${point.approvalRate},
          ${point.attempts},
          ${point.asOf}::timestamptz,
          ${point.maxAgeMs}
        )
        ON CONFLICT (rail_id) DO UPDATE SET
          approval_rate = EXCLUDED.approval_rate,
          attempts = EXCLUDED.attempts,
          as_of = EXCLUDED.as_of,
          max_age_ms = EXCLUDED.max_age_ms,
          published_at = now()
      `;
    },
  };
}
