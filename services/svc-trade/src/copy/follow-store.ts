import type { Sql } from 'postgres';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import type { CopyFollow } from './follows.js';

/**
 * Durable copy-follow store (trade.copy residual — same pattern as #1010 TWAP).
 *
 * Process Maps lose follows/exposure on restart. This store keeps the envelope
 * + open exposure so a restarted process resumes the same parent state.
 * §8 rates stay refuse-closed in CopyService — this never invents them.
 */

export interface CopyPeriodStats {
  readonly earningsPaid: Amount;
  readonly roundTrips: number;
}

export interface CopyFollowStore {
  saveFollow(follow: CopyFollow, exposure?: Amount): Promise<void>;
  getFollow(followId: string): Promise<CopyFollow | null>;
  deleteFollow(followId: string): Promise<void>;
  /** All follows (for already-following + hydrate). */
  listFollows(): Promise<CopyFollow[]>;
  getExposure(followId: string): Promise<Amount>;
  setExposure(followId: string, amount: Amount): Promise<void>;
  getPeriodStats(pairKey: string): Promise<CopyPeriodStats>;
  setPeriodStats(pairKey: string, stats: CopyPeriodStats): Promise<void>;
}

/** In-memory store — default for unit tests and single-process dev. */
export class MemoryCopyFollowStore implements CopyFollowStore {
  private readonly follows = new Map<string, CopyFollow>();
  private readonly exposure = new Map<string, Amount>();
  private readonly period = new Map<string, CopyPeriodStats>();

  async saveFollow(follow: CopyFollow, exposure: Amount = 0n): Promise<void> {
    this.follows.set(follow.followId, follow);
    if (!this.exposure.has(follow.followId)) {
      this.exposure.set(follow.followId, exposure);
    }
  }

  async getFollow(followId: string): Promise<CopyFollow | null> {
    return this.follows.get(followId) ?? null;
  }

  async deleteFollow(followId: string): Promise<void> {
    this.follows.delete(followId);
    this.exposure.delete(followId);
  }

  async listFollows(): Promise<CopyFollow[]> {
    return [...this.follows.values()];
  }

  async getExposure(followId: string): Promise<Amount> {
    return this.exposure.get(followId) ?? 0n;
  }

  async setExposure(followId: string, amount: Amount): Promise<void> {
    this.exposure.set(followId, amount);
  }

  async getPeriodStats(pairKey: string): Promise<CopyPeriodStats> {
    return this.period.get(pairKey) ?? { earningsPaid: 0n, roundTrips: 0 };
  }

  async setPeriodStats(pairKey: string, stats: CopyPeriodStats): Promise<void> {
    this.period.set(pairKey, stats);
  }
}

type FollowRow = {
  follow_id: string;
  follower_id: string;
  leader_id: string;
  region: string;
  permitted_markets: unknown;
  max_notional_per_order: string;
  max_aggregate_exposure: string;
  expires_at: Date;
  fee_share_killed: boolean;
  exposure: string;
  created_at: Date;
};

function marketsFromJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => String(m));
}

function rowToFollow(row: FollowRow): CopyFollow {
  return {
    followId: row.follow_id,
    followerId: row.follower_id,
    leaderId: row.leader_id,
    region: row.region,
    envelope: {
      permittedMarkets: marketsFromJson(row.permitted_markets),
      maxNotionalPerOrder: parseAmount(String(row.max_notional_per_order)),
      maxAggregateExposure: parseAmount(String(row.max_aggregate_exposure)),
      expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
    },
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    feeShareKilled: row.fee_share_killed,
  };
}

export class SqlCopyFollowStore implements CopyFollowStore {
  constructor(private readonly sql: Sql) {}

  async saveFollow(follow: CopyFollow, exposure: Amount = 0n): Promise<void> {
    const markets = JSON.stringify([...follow.envelope.permittedMarkets]);
    await this.sql`
      INSERT INTO copy_follows (
        follow_id, follower_id, leader_id, region, permitted_markets,
        max_notional_per_order, max_aggregate_exposure, expires_at,
        fee_share_killed, exposure, created_at, updated_at
      ) VALUES (
        ${follow.followId},
        ${follow.followerId},
        ${follow.leaderId},
        ${follow.region},
        ${markets}::jsonb,
        ${formatAmount(follow.envelope.maxNotionalPerOrder)},
        ${formatAmount(follow.envelope.maxAggregateExposure)},
        ${follow.envelope.expiresAt},
        ${follow.feeShareKilled},
        ${formatAmount(exposure)},
        ${follow.createdAt},
        now()
      )
      ON CONFLICT (follow_id) DO UPDATE SET
        fee_share_killed = EXCLUDED.fee_share_killed,
        permitted_markets = EXCLUDED.permitted_markets,
        max_notional_per_order = EXCLUDED.max_notional_per_order,
        max_aggregate_exposure = EXCLUDED.max_aggregate_exposure,
        expires_at = EXCLUDED.expires_at,
        region = EXCLUDED.region,
        updated_at = now()
    `;
  }

  async getFollow(followId: string): Promise<CopyFollow | null> {
    const rows = await this.sql<FollowRow[]>`
      SELECT follow_id, follower_id, leader_id, region, permitted_markets,
             max_notional_per_order::text, max_aggregate_exposure::text,
             expires_at, fee_share_killed, exposure::text, created_at
        FROM copy_follows
       WHERE follow_id = ${followId}
       LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToFollow(row) : null;
  }

  async deleteFollow(followId: string): Promise<void> {
    await this.sql`DELETE FROM copy_follows WHERE follow_id = ${followId}`;
  }

  async listFollows(): Promise<CopyFollow[]> {
    const rows = await this.sql<FollowRow[]>`
      SELECT follow_id, follower_id, leader_id, region, permitted_markets,
             max_notional_per_order::text, max_aggregate_exposure::text,
             expires_at, fee_share_killed, exposure::text, created_at
        FROM copy_follows
    `;
    return rows.map(rowToFollow);
  }

  async getExposure(followId: string): Promise<Amount> {
    const rows = await this.sql<Array<{ exposure: string }>>`
      SELECT exposure::text FROM copy_follows WHERE follow_id = ${followId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return 0n;
    return parseAmount(String(row.exposure));
  }

  async setExposure(followId: string, amount: Amount): Promise<void> {
    await this.sql`
      UPDATE copy_follows
         SET exposure = ${formatAmount(amount)}, updated_at = now()
       WHERE follow_id = ${followId}
    `;
  }

  async getPeriodStats(pairKey: string): Promise<CopyPeriodStats> {
    const rows = await this.sql<Array<{ earnings_paid: string; round_trips: number }>>`
      SELECT earnings_paid::text, round_trips
        FROM copy_period_stats
       WHERE pair_key = ${pairKey}
       LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { earningsPaid: 0n, roundTrips: 0 };
    return {
      earningsPaid: parseAmount(String(row.earnings_paid)),
      roundTrips: row.round_trips,
    };
  }

  async setPeriodStats(pairKey: string, stats: CopyPeriodStats): Promise<void> {
    await this.sql`
      INSERT INTO copy_period_stats (pair_key, earnings_paid, round_trips, updated_at)
      VALUES (${pairKey}, ${formatAmount(stats.earningsPaid)}, ${stats.roundTrips}, now())
      ON CONFLICT (pair_key) DO UPDATE SET
        earnings_paid = EXCLUDED.earnings_paid,
        round_trips = EXCLUDED.round_trips,
        updated_at = now()
    `;
  }
}
