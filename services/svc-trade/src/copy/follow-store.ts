import type { Sql } from 'postgres';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import type { CopyFollow } from './follows.js';

/**
 * Durable copy-follow store (trade.copy residual — same pattern as #1010 TWAP).
 *
 * Process Maps lose follows/exposure on restart. This store keeps the envelope
 * + open exposure so a restarted process resumes the same parent state.
 * §8 rates stay refuse-closed in CopyService — this never invents them.
 *
 * Cap-critical counters use atomic reserve/add primitives so concurrent
 * settleFeeShare / planMirrorForFollow cannot over-pay or over-expose (#1191).
 *
 * Mirrored leader fills are claimed by (followId, fillId). A redelivered
 * observation must return the prior plan and never bump exposure again —
 * same business-key shape as fee-share settle / ledger fill keys. Mirror claims
 * serialise on `exp:${followId}` so they compose with addExposureIfUnderCap.
 *
 * Fee-share settle is claimed by the same (followId, fillId) shape. A redelivered
 * settle must return the prior attribution and never re-run reserveEarnings
 * (period earningsPaid / roundTrips poison). Ledger keys alone are not enough:
 * reserve runs *before* the post.
 */

export interface CopyPeriodStats {
  readonly earningsPaid: Amount;
  readonly roundTrips: number;
}

/** Result of atomically claiming leader fee-share headroom under the period cap. */
export type ReserveEarningsResult = {
  readonly reserved: Amount;
  readonly newPaid: Amount;
  readonly roundTrips: number;
};

export type AddExposureResult = { readonly ok: true; readonly newExposure: Amount } | { readonly ok: false; readonly current: Amount };

/**
 * Prior mirror plan stored under a claimed leader fillId.
 * Enough to re-present the plan on redelivery without re-running envelope math.
 */
export interface StoredMirrorPlan {
  readonly fillId: string;
  readonly followId: string;
  readonly followerId: string;
  readonly leaderId: string;
  readonly marketId: string;
  readonly side: 'buy' | 'sell';
  readonly qty: Amount;
  readonly notional: Amount;
  readonly nextExposure: Amount;
}

/**
 * Result of claiming a leader fill for mirror under one follow.
 *
 * - `duplicate` — fillId already claimed; exposure untouched; return prior plan.
 * - `claimed` — first time; exposure advanced; plan persisted.
 * - `cap_exceeded` — would breach maxAggregate; nothing recorded.
 */
export type ClaimMirrorFillResult =
  | { readonly status: 'duplicate'; readonly plan: StoredMirrorPlan }
  | { readonly status: 'claimed'; readonly plan: StoredMirrorPlan }
  | { readonly status: 'cap_exceeded'; readonly current: Amount };

/**
 * Prior fee-share settle under a claimed (follow, fill). Enough to re-present
 * on redelivery without re-running reserve / ledger.
 */
export interface StoredSettledFeeShare {
  readonly fillId: string;
  readonly followId: string;
  readonly leaderId: string;
  readonly followerId: string;
  readonly assetId: string;
  readonly protocolFee: Amount;
  readonly appliedShareBps: number;
  readonly grossLeaderShare: Amount;
  readonly cappedLeaderShare: Amount;
  readonly skippedReason: null | 'cap_reached' | 'zero_share';
  readonly settled: boolean;
}

export type RunFeeShareSettleOnceResult =
  | { readonly status: 'duplicate'; readonly record: StoredSettledFeeShare }
  | { readonly status: 'claimed'; readonly record: StoredSettledFeeShare };

export interface CopyFollowStore {
  /**
   * Linearize every action for one follow across processes.
   *
   * Kill/unfollow acknowledgements wait for an already-started mirror/settle;
   * after acknowledgement, no later action can pass a stale follow snapshot.
   */
  runFollowExclusive<T>(followId: string, run: (lockedStore: CopyFollowStore) => Promise<T>): Promise<T>;
  saveFollow(follow: CopyFollow, exposure?: Amount): Promise<void>;
  getFollow(followId: string): Promise<CopyFollow | null>;
  deleteFollow(followId: string): Promise<void>;
  /** All follows (hydrate / ops). Product desk uses listFollowsByFollower. */
  listFollows(): Promise<CopyFollow[]>;
  /** Caller-scoped list — never loads another follower's envelope. */
  listFollowsByFollower(followerId: string): Promise<CopyFollow[]>;
  getExposure(followId: string): Promise<Amount>;
  setExposure(followId: string, amount: Amount): Promise<void>;
  /**
   * Atomically add `delta` to exposure when `current + delta <= maxAggregate`.
   * Concurrent mirrors cannot both clear a near-cap check.
   */
  addExposureIfUnderCap(followId: string, delta: Amount, maxAggregate: Amount): Promise<AddExposureResult>;
  getPeriodStats(pairKey: string): Promise<CopyPeriodStats>;
  setPeriodStats(pairKey: string, stats: CopyPeriodStats): Promise<void>;
  /**
   * Atomically claim up to `amount` of remaining cap headroom and +1 round-trip.
   * `reserved = min(amount, max(cap - paid, 0))`. Always increments round-trips
   * (including when reserved is 0) so decay still advances on cap skips.
   */
  reserveEarnings(pairKey: string, amount: Amount, cap: Amount): Promise<ReserveEarningsResult>;
  /**
   * Roll back a prior reserve after ledger post failure. Does not undo
   * round-trips — the attempt still counted for decay.
   */
  releaseEarnings(pairKey: string, amount: Amount): Promise<void>;
  /** Drop a pair's churn counters — used when the follow itself goes away. */
  clearPeriodStats(pairKey: string): Promise<void>;
  /**
   * Look up a previously claimed mirror for (follow, leader fill).
   * Null when this fill has never been mirrored under this follow.
   */
  getMirroredFill(followId: string, fillId: string): Promise<StoredMirrorPlan | null>;
  /**
   * Atomically claim a leader fillId for this follow and apply notional to
   * exposure when under cap. Same fillId twice → prior plan, no second bump.
   *
   * Serialises on followId (same exclusive domain as addExposureIfUnderCap)
   * so concurrent first-claims cannot both advance.
   */
  claimMirrorFill(input: {
    followId: string;
    fillId: string;
    maxAggregate: Amount;
    plan: Omit<StoredMirrorPlan, 'nextExposure'>;
  }): Promise<ClaimMirrorFillResult>;
  /**
   * Look up a previously claimed fee-share settle for (follow, follower fill).
   * Null when this fill has never been settled under this follow.
   */
  getSettledFeeShare(followId: string, fillId: string): Promise<StoredSettledFeeShare | null>;
  /**
   * Run fee-share settle body at most once per (followId, fillId).
   * Redelivery / concurrent callers receive the prior record without re-running
   * `run` (so reserveEarnings does not fire again).
   */
  runFeeShareSettleOnce(followId: string, fillId: string, run: () => Promise<StoredSettledFeeShare>): Promise<RunFeeShareSettleOnceResult>;
}

/**
 * Per-key async mutex — serialises reserve/add/claim critical sections on Memory.
 * Promise-chain: each caller awaits the previous, then holds until done.
 */
function createExclusiveQueue() {
  const tails = new Map<string, Promise<void>>();
  return async function exclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(
      key,
      prev.then(
        () => gate,
        () => gate,
      ),
    );
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

function mirrorKey(followId: string, fillId: string): string {
  return `${followId}\0${fillId}`;
}

function settleKey(followId: string, fillId: string): string {
  return `${followId}\0${fillId}`;
}

/** In-memory store — default for unit tests and single-process dev. */
export class MemoryCopyFollowStore implements CopyFollowStore {
  private readonly follows = new Map<string, CopyFollow>();
  private readonly exposure = new Map<string, Amount>();
  private readonly period = new Map<string, CopyPeriodStats>();
  /** Keyed `${followId}\0${fillId}` — one plan per leader fill under a follow. */
  private readonly mirrored = new Map<string, StoredMirrorPlan>();
  /** Keyed `${followId}\0${fillId}` — one fee-share settle per follower fill. */
  private readonly settled = new Map<string, StoredSettledFeeShare>();
  private readonly exclusive = createExclusiveQueue();

  async runFollowExclusive<T>(followId: string, run: (lockedStore: CopyFollowStore) => Promise<T>): Promise<T> {
    return this.exclusive(`follow:${followId}`, () => run(this));
  }

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
    // Drop claimed mirrors for this envelope. A re-follow gets a new followId
    // and must not inherit old fill claims (fresh session budget).
    for (const key of [...this.mirrored.keys()]) {
      if (key.startsWith(`${followId}\0`)) {
        this.mirrored.delete(key);
      }
    }
    for (const key of [...this.settled.keys()]) {
      if (key.startsWith(`${followId}\0`)) {
        this.settled.delete(key);
      }
    }
  }

  async listFollows(): Promise<CopyFollow[]> {
    return [...this.follows.values()];
  }

  async listFollowsByFollower(followerId: string): Promise<CopyFollow[]> {
    return [...this.follows.values()].filter((f) => f.followerId === followerId);
  }

  async getExposure(followId: string): Promise<Amount> {
    return this.exposure.get(followId) ?? 0n;
  }

  async setExposure(followId: string, amount: Amount): Promise<void> {
    this.exposure.set(followId, amount);
  }

  async addExposureIfUnderCap(followId: string, delta: Amount, maxAggregate: Amount): Promise<AddExposureResult> {
    return this.exclusive(`exp:${followId}`, () => {
      const current = this.exposure.get(followId) ?? 0n;
      if (delta < 0n) {
        return { ok: false as const, current };
      }
      const next = current + delta;
      if (next > maxAggregate) {
        return { ok: false as const, current };
      }
      this.exposure.set(followId, next);
      return { ok: true as const, newExposure: next };
    });
  }

  async getPeriodStats(pairKey: string): Promise<CopyPeriodStats> {
    return this.period.get(pairKey) ?? { earningsPaid: 0n, roundTrips: 0 };
  }

  async setPeriodStats(pairKey: string, stats: CopyPeriodStats): Promise<void> {
    this.period.set(pairKey, stats);
  }

  async reserveEarnings(pairKey: string, amount: Amount, cap: Amount): Promise<ReserveEarningsResult> {
    return this.exclusive(`per:${pairKey}`, () => {
      const cur = this.period.get(pairKey) ?? { earningsPaid: 0n, roundTrips: 0 };
      const remaining = cap > cur.earningsPaid ? cap - cur.earningsPaid : 0n;
      const want = amount > 0n ? amount : 0n;
      const reserved = want <= remaining ? want : remaining;
      const newPaid = cur.earningsPaid + reserved;
      const roundTrips = cur.roundTrips + 1;
      this.period.set(pairKey, { earningsPaid: newPaid, roundTrips });
      return { reserved, newPaid, roundTrips };
    });
  }

  async releaseEarnings(pairKey: string, amount: Amount): Promise<void> {
    if (amount <= 0n) return;
    await this.exclusive(`per:${pairKey}`, () => {
      const cur = this.period.get(pairKey) ?? { earningsPaid: 0n, roundTrips: 0 };
      const nextPaid = cur.earningsPaid > amount ? cur.earningsPaid - amount : 0n;
      this.period.set(pairKey, { earningsPaid: nextPaid, roundTrips: cur.roundTrips });
    });
  }

  async clearPeriodStats(pairKey: string): Promise<void> {
    this.period.delete(pairKey);
  }

  async getMirroredFill(followId: string, fillId: string): Promise<StoredMirrorPlan | null> {
    return this.mirrored.get(mirrorKey(followId, fillId)) ?? null;
  }

  async claimMirrorFill(input: {
    followId: string;
    fillId: string;
    maxAggregate: Amount;
    plan: Omit<StoredMirrorPlan, 'nextExposure'>;
  }): Promise<ClaimMirrorFillResult> {
    // Same exclusive domain as addExposureIfUnderCap (`exp:${followId}`).
    return this.exclusive(`exp:${input.followId}`, () => {
      const key = mirrorKey(input.followId, input.fillId);
      const existing = this.mirrored.get(key);
      if (existing) {
        return { status: 'duplicate' as const, plan: existing };
      }

      const current = this.exposure.get(input.followId) ?? 0n;
      if (input.plan.notional < 0n) {
        return { status: 'cap_exceeded' as const, current };
      }
      const nextExposure = current + input.plan.notional;
      if (nextExposure > input.maxAggregate) {
        return { status: 'cap_exceeded' as const, current };
      }

      const plan: StoredMirrorPlan = { ...input.plan, nextExposure };
      this.exposure.set(input.followId, nextExposure);
      this.mirrored.set(key, plan);
      return { status: 'claimed' as const, plan };
    });
  }

  async getSettledFeeShare(followId: string, fillId: string): Promise<StoredSettledFeeShare | null> {
    return this.settled.get(settleKey(followId, fillId)) ?? null;
  }

  async runFeeShareSettleOnce(
    followId: string,
    fillId: string,
    run: () => Promise<StoredSettledFeeShare>,
  ): Promise<RunFeeShareSettleOnceResult> {
    // Exclusive on settle key so concurrent redeliveries of the same fill
    // cannot both pass a null lookup and both reserve.
    return this.exclusive(`settle:${settleKey(followId, fillId)}`, async () => {
      const key = settleKey(followId, fillId);
      const existing = this.settled.get(key);
      if (existing) {
        return { status: 'duplicate' as const, record: existing };
      }
      const record = await run();
      this.settled.set(key, record);
      return { status: 'claimed' as const, record };
    });
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

type MirroredFillRow = {
  fill_id: string;
  follow_id: string;
  follower_id: string;
  leader_id: string;
  market_id: string;
  side: string;
  qty: string;
  notional: string;
  next_exposure: string;
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

function rowToMirrored(row: MirroredFillRow): StoredMirrorPlan {
  const side = row.side === 'sell' ? 'sell' : 'buy';
  return {
    fillId: row.fill_id,
    followId: row.follow_id,
    followerId: row.follower_id,
    leaderId: row.leader_id,
    marketId: row.market_id,
    side,
    qty: parseAmount(String(row.qty)),
    notional: parseAmount(String(row.notional)),
    nextExposure: parseAmount(String(row.next_exposure)),
  };
}

/**
 * SQL store.
 *
 * Mirrored fills live in `trade.copy_mirrored_fills` (PK follow_id + fill_id).
 * Migration: drizzle/0021_copy_mirrored_fills.sql. Unit tests use Memory.
 */
export class SqlCopyFollowStore implements CopyFollowStore {
  constructor(
    private readonly sql: Sql,
    private readonly lockedFollowId?: string,
  ) {}

  private async withAdvisoryLock<T>(key: string, run: () => Promise<T>): Promise<T> {
    // Session locks must be acquired and released on the SAME physical
    // connection. `sql.reserve()` pins one; issuing lock/unlock through the pool
    // can unlock a different session and silently leave the first lock behind.
    const connection = await this.sql.reserve();
    let locked = false;
    try {
      await connection`SELECT pg_advisory_lock(hashtext(${key}))`;
      locked = true;
      return await run();
    } finally {
      try {
        if (locked) {
          await connection`SELECT pg_advisory_unlock(hashtext(${key}))`;
        }
      } finally {
        connection.release();
      }
    }
  }

  async runFollowExclusive<T>(followId: string, run: (lockedStore: CopyFollowStore) => Promise<T>): Promise<T> {
    const connection = await this.sql.reserve();
    const lockKey = `copy-follow:${followId}`;
    let locked = false;
    try {
      await connection`SELECT pg_advisory_lock(hashtext(${lockKey}))`;
      locked = true;
      // Every guarded query uses the same pinned connection. Holding a session
      // lock on one pool connection while querying through another can exhaust
      // the pool when many follows settle concurrently.
      return await run(new SqlCopyFollowStore(connection, followId));
    } finally {
      try {
        if (locked) {
          await connection`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
        }
      } finally {
        connection.release();
      }
    }
  }

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
    await this.sql`DELETE FROM copy_settled_fee_shares WHERE follow_id = ${followId}`;
    await this.sql`DELETE FROM copy_mirrored_fills WHERE follow_id = ${followId}`;
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

  async listFollowsByFollower(followerId: string): Promise<CopyFollow[]> {
    const rows = await this.sql<FollowRow[]>`
      SELECT follow_id, follower_id, leader_id, region, permitted_markets,
             max_notional_per_order::text, max_aggregate_exposure::text,
             expires_at, fee_share_killed, exposure::text, created_at
        FROM copy_follows
       WHERE follower_id = ${followerId}
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

  async addExposureIfUnderCap(followId: string, delta: Amount, maxAggregate: Amount): Promise<AddExposureResult> {
    if (delta < 0n) {
      const current = await this.getExposure(followId);
      return { ok: false, current };
    }
    const deltaStr = formatAmount(delta);
    const maxStr = formatAmount(maxAggregate);
    const rows = await this.sql<Array<{ exposure: string }>>`
      UPDATE copy_follows
         SET exposure = exposure + ${deltaStr}::numeric,
             updated_at = now()
       WHERE follow_id = ${followId}
         AND exposure + ${deltaStr}::numeric <= ${maxStr}::numeric
      RETURNING exposure::text
    `;
    const row = rows[0];
    if (row) {
      return { ok: true, newExposure: parseAmount(String(row.exposure)) };
    }
    return { ok: false, current: await this.getExposure(followId) };
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

  async reserveEarnings(pairKey: string, amount: Amount, cap: Amount): Promise<ReserveEarningsResult> {
    // Transaction: row lock + claim headroom + bump round-trips. Concurrent
    // settlers serialise here so paid + reserved never exceeds cap.
    return await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO copy_period_stats (pair_key, earnings_paid, round_trips, updated_at)
        VALUES (${pairKey}, 0, 0, now())
        ON CONFLICT (pair_key) DO NOTHING
      `;
      const rows = await tx<Array<{ earnings_paid: string; round_trips: number }>>`
        SELECT earnings_paid::text, round_trips
          FROM copy_period_stats
         WHERE pair_key = ${pairKey}
         FOR UPDATE
      `;
      const row = rows[0]!;
      const paid = parseAmount(String(row.earnings_paid));
      const remaining = cap > paid ? cap - paid : 0n;
      const want = amount > 0n ? amount : 0n;
      const reserved = want <= remaining ? want : remaining;
      const newPaid = paid + reserved;
      const roundTrips = row.round_trips + 1;
      await tx`
        UPDATE copy_period_stats
           SET earnings_paid = ${formatAmount(newPaid)},
               round_trips = ${roundTrips},
               updated_at = now()
         WHERE pair_key = ${pairKey}
      `;
      return { reserved, newPaid, roundTrips };
    });
  }

  async releaseEarnings(pairKey: string, amount: Amount): Promise<void> {
    if (amount <= 0n) return;
    const amountStr = formatAmount(amount);
    await this.sql`
      UPDATE copy_period_stats
         SET earnings_paid = GREATEST(earnings_paid - ${amountStr}::numeric, 0),
             updated_at = now()
       WHERE pair_key = ${pairKey}
    `;
  }

  async clearPeriodStats(pairKey: string): Promise<void> {
    await this.sql`DELETE FROM copy_period_stats WHERE pair_key = ${pairKey}`;
  }

  async getMirroredFill(followId: string, fillId: string): Promise<StoredMirrorPlan | null> {
    const rows = await this.sql<MirroredFillRow[]>`
      SELECT fill_id, follow_id, follower_id, leader_id, market_id, side,
             qty::text, notional::text, next_exposure::text
        FROM copy_mirrored_fills
       WHERE follow_id = ${followId} AND fill_id = ${fillId}
       LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToMirrored(row) : null;
  }

  async claimMirrorFill(input: {
    followId: string;
    fillId: string;
    maxAggregate: Amount;
    plan: Omit<StoredMirrorPlan, 'nextExposure'>;
  }): Promise<ClaimMirrorFillResult> {
    if (input.plan.notional < 0n) {
      return { status: 'cap_exceeded', current: await this.getExposure(input.followId) };
    }
    const notionalStr = formatAmount(input.plan.notional);
    const maxStr = formatAmount(input.maxAggregate);

    // Transaction: lock follow row → check fill claim → bump exposure under
    // cap → insert mirrored plan. Concurrent same fillId serialises here.
    return await this.sql.begin(async (tx) => {
      const followRows = await tx<Array<{ exposure: string }>>`
        SELECT exposure::text
          FROM copy_follows
         WHERE follow_id = ${input.followId}
         FOR UPDATE
      `;
      const followRow = followRows[0];
      if (!followRow) {
        // Follow vanished mid-flight — treat as cap refuse rather than invent.
        return { status: 'cap_exceeded' as const, current: 0n };
      }

      const existingRows = await tx<MirroredFillRow[]>`
        SELECT fill_id, follow_id, follower_id, leader_id, market_id, side,
               qty::text, notional::text, next_exposure::text
          FROM copy_mirrored_fills
         WHERE follow_id = ${input.followId} AND fill_id = ${input.fillId}
         LIMIT 1
      `;
      const existing = existingRows[0];
      if (existing) {
        return { status: 'duplicate' as const, plan: rowToMirrored(existing) };
      }

      const current = parseAmount(String(followRow.exposure));
      const nextExposure = current + input.plan.notional;
      if (nextExposure > input.maxAggregate) {
        return { status: 'cap_exceeded' as const, current };
      }

      await tx`
        UPDATE copy_follows
           SET exposure = ${formatAmount(nextExposure)}, updated_at = now()
         WHERE follow_id = ${input.followId}
           AND exposure + ${notionalStr}::numeric <= ${maxStr}::numeric
      `;

      const plan: StoredMirrorPlan = { ...input.plan, nextExposure };
      await tx`
        INSERT INTO copy_mirrored_fills (
          follow_id, fill_id, follower_id, leader_id, market_id, side,
          qty, notional, next_exposure, created_at
        ) VALUES (
          ${plan.followId},
          ${plan.fillId},
          ${plan.followerId},
          ${plan.leaderId},
          ${plan.marketId},
          ${plan.side},
          ${formatAmount(plan.qty)},
          ${formatAmount(plan.notional)},
          ${formatAmount(plan.nextExposure)},
          now()
        )
      `;
      return { status: 'claimed' as const, plan };
    });
  }

  async getSettledFeeShare(followId: string, fillId: string): Promise<StoredSettledFeeShare | null> {
    const rows = await this.sql<SettledFeeShareRow[]>`
      SELECT fill_id, follow_id, leader_id, follower_id, asset_id,
             protocol_fee::text, applied_share_bps, gross_leader_share::text,
             capped_leader_share::text, skipped_reason, settled
        FROM copy_settled_fee_shares
       WHERE follow_id = ${followId} AND fill_id = ${fillId}
       LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToSettled(row) : null;
  }

  async runFeeShareSettleOnce(
    followId: string,
    fillId: string,
    run: () => Promise<StoredSettledFeeShare>,
  ): Promise<RunFeeShareSettleOnceResult> {
    const settleOnce = async () => {
      const existing = await this.getSettledFeeShare(followId, fillId);
      if (existing) {
        return { status: 'duplicate' as const, record: existing };
      }
      const record = await run();
      await this.sql`
        INSERT INTO copy_settled_fee_shares (
          follow_id, fill_id, leader_id, follower_id, asset_id,
          protocol_fee, applied_share_bps, gross_leader_share, capped_leader_share,
          skipped_reason, settled, created_at
        ) VALUES (
          ${record.followId},
          ${record.fillId},
          ${record.leaderId},
          ${record.followerId},
          ${record.assetId},
          ${formatAmount(record.protocolFee)},
          ${record.appliedShareBps},
          ${formatAmount(record.grossLeaderShare)},
          ${formatAmount(record.cappedLeaderShare)},
          ${record.skippedReason},
          ${record.settled},
          now()
        )
        ON CONFLICT (follow_id, fill_id) DO NOTHING
      `;
      // Concurrent winner may have inserted first under a race after unlock window —
      // re-read wins. In practice the advisory lock prevents this path.
      const saved = (await this.getSettledFeeShare(followId, fillId)) ?? record;
      return { status: 'claimed' as const, record: saved };
    };
    // CopyService holds the stronger per-follow lock for the whole money path.
    // Avoid reserving a second pool connection while that lock is held.
    if (this.lockedFollowId === followId) {
      return settleOnce();
    }
    return this.withAdvisoryLock(`copy-settle:${followId}:${fillId}`, settleOnce);
  }
}

type SettledFeeShareRow = {
  fill_id: string;
  follow_id: string;
  leader_id: string;
  follower_id: string;
  asset_id: string;
  protocol_fee: string;
  applied_share_bps: number;
  gross_leader_share: string;
  capped_leader_share: string;
  skipped_reason: string | null;
  settled: boolean;
};

function rowToSettled(row: SettledFeeShareRow): StoredSettledFeeShare {
  const skipped = row.skipped_reason === 'cap_reached' || row.skipped_reason === 'zero_share' ? row.skipped_reason : null;
  return {
    fillId: row.fill_id,
    followId: row.follow_id,
    leaderId: row.leader_id,
    followerId: row.follower_id,
    assetId: row.asset_id,
    protocolFee: parseAmount(String(row.protocol_fee)),
    appliedShareBps: row.applied_share_bps,
    grossLeaderShare: parseAmount(String(row.gross_leader_share)),
    cappedLeaderShare: parseAmount(String(row.capped_leader_share)),
    skippedReason: skipped,
    settled: row.settled === true,
  };
}
