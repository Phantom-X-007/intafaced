/**
 * Postgres persistence sink — connect.data-lake TSDB write path (D27-P4).
 *
 * Inserts measured capture rows into connect_lake.lake_ticks. Absent rows are
 * skipped — holes stay in the in-process log only. Injectable client keeps CI
 * off a live database.
 */

import type { CaptureRecord } from './capture.js';

export const LAKE_TICKS_INSERT_SQL = `
INSERT INTO connect_lake.lake_ticks (venue_id, symbol, captured_at, payload, seq)
VALUES ($1, $2, $3, $4::jsonb, $5)
`;

export type LakeTickInsertRow = {
  readonly venueId: string;
  readonly symbol: string;
  readonly capturedAt: string;
  readonly payload: CaptureRecord;
  readonly seq: number | null;
};

/** Minimal postgres client surface — satisfied by `postgres` Sql and test doubles. */
export type PersistenceSqlClient = {
  unsafe(query: string, parameters?: readonly unknown[]): Promise<unknown>;
  end?(options?: { timeout?: number }): Promise<void>;
};

export function lakeTickRowsFromCaptureRecords(records: readonly CaptureRecord[]): LakeTickInsertRow[] {
  const rows: LakeTickInsertRow[] = [];
  for (const record of records) {
    if (record.status !== 'measured') continue;
    rows.push({
      venueId: record.venueId,
      symbol: record.marketId,
      capturedAt: record.capturedAt,
      payload: record,
      seq: sequenceFromMeasuredRecord(record),
    });
  }
  return rows;
}

function sequenceFromMeasuredRecord(record: Extract<CaptureRecord, { status: 'measured' }>): number | null {
  if ('sequence' in record) return record.sequence;
  return null;
}

export async function persistCaptureRecordsToPostgres(records: readonly CaptureRecord[], client: PersistenceSqlClient): Promise<number> {
  const rows = lakeTickRowsFromCaptureRecords(records);
  for (const row of rows) {
    await client.unsafe(LAKE_TICKS_INSERT_SQL, [row.venueId, row.symbol, row.capturedAt, JSON.stringify(row.payload), row.seq]);
  }
  return rows.length;
}
