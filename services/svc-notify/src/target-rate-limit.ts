/**
 * Per-user+channel sliding-window rate limits for address registration and
 * verification codes.
 *
 * WHY
 *
 * `registerTarget` sends a confirmation code THROUGH the channel being
 * registered. Without a throttle, an authenticated caller can trigger unlimited
 * SMS to any number they type — billing exposure and abuse. `verifyTarget`
 * accepts a 6-digit code with a 15-minute TTL; unlimited guesses make brute
 * force cheap. The only other limiter in the platform is the edge global one,
 * which is off by default (closeout: LANE-CLOSEOUT-OPS-2026-08-08).
 *
 * SHAPE
 *
 * Two implementations share one interface:
 *
 *   MemoryTargetRateLimiter     process-local; unit tests and single-process
 *                               harnesses. Not production.
 *   PostgresTargetRateLimiter   one row per (user, channel, op) with
 *                               SELECT … FOR UPDATE. Two replicas share the
 *                               budget — the multi-replica residual after #1187.
 *
 * Named refuse codes (not a generic 429 body) so the client can render "try
 * later" without inventing copy: `channel.register_rate_limited` /
 * `channel.verify_rate_limited`.
 */

import type { Sql } from 'postgres';
import type { ChannelId } from './channels/channel.js';

export type TargetRateOp = 'register' | 'verify';

export interface TargetRateLimitConfig {
  /** Max successful-slot takes per window. */
  readonly max: number;
  /** Window length in ms. */
  readonly windowMs: number;
}

/** Register: few SMS/emails per window — each one costs money and attention. */
export const DEFAULT_REGISTER_LIMIT: TargetRateLimitConfig = {
  max: 3,
  windowMs: 15 * 60_000,
};

/** Verify: more headroom than register (typos), still far below 1e6 brute force. */
export const DEFAULT_VERIFY_LIMIT: TargetRateLimitConfig = {
  max: 10,
  windowMs: 15 * 60_000,
};

export interface TargetRateLimiterOptions {
  readonly register?: TargetRateLimitConfig;
  readonly verify?: TargetRateLimitConfig;
  /** Injectable clock for tests (memory only; Postgres uses `now()`). */
  readonly now?: () => number;
}

/**
 * Async on purpose: the production implementation hits Postgres. Callers must
 * await so a refuse happens BEFORE upsert/send, never after.
 *
 * Named `…Port` so the memory class can keep the historical export name
 * `TargetRateLimiter` without clashing.
 */
export interface TargetRateLimiterPort {
  tryTake(userId: string, channel: ChannelId, op: TargetRateOp): Promise<boolean>;
  /** Test helper — clear all windows. Optional on Postgres (use DELETE in suite). */
  reset?(): void | Promise<void>;
}

function resolveCfg(opts: TargetRateLimiterOptions, op: TargetRateOp): TargetRateLimitConfig {
  return op === 'register' ? (opts.register ?? DEFAULT_REGISTER_LIMIT) : (opts.verify ?? DEFAULT_VERIFY_LIMIT);
}

/**
 * Process-local sliding window. Kept for unit tests that must not need a
 * database. Production wires `PostgresTargetRateLimiter`.
 */
export class MemoryTargetRateLimiter implements TargetRateLimiterPort {
  private readonly hits = new Map<string, number[]>();
  private readonly opts: TargetRateLimiterOptions;
  private readonly now: () => number;

  constructor(opts: TargetRateLimiterOptions = {}) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
  }

  async tryTake(userId: string, channel: ChannelId, op: TargetRateOp): Promise<boolean> {
    const cfg = resolveCfg(this.opts, op);
    const key = `${userId}\0${channel}\0${op}`;
    const now = this.now();
    const windowStart = now - cfg.windowMs;
    const prior = this.hits.get(key) ?? [];
    const recent = prior.filter((t) => t > windowStart);
    if (recent.length >= cfg.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

/** Memory limiter under the historical name tests and options still use. */
export class TargetRateLimiter extends MemoryTargetRateLimiter {}

/**
 * Shared sliding window in Postgres. Two service processes that share this
 * table cannot both take past `max` for the same user+channel+op.
 */
export class PostgresTargetRateLimiter implements TargetRateLimiterPort {
  private readonly opts: TargetRateLimiterOptions;

  constructor(
    private readonly sql: Sql,
    opts: TargetRateLimiterOptions = {},
  ) {
    this.opts = opts;
  }

  async tryTake(userId: string, channel: ChannelId, op: TargetRateOp): Promise<boolean> {
    const cfg = resolveCfg(this.opts, op);
    // Transaction + row lock: two replicas racing the last slot — exactly one
    // wins. Without FOR UPDATE both would read hit_count < max and both insert.
    return this.sql.begin(async (tx) => {
      // Ensure a row exists so FOR UPDATE has something to lock.
      await tx`
        INSERT INTO notify.target_rate_windows (user_id, channel, op, window_start, hit_count)
        VALUES (${userId}, ${channel}, ${op}, now(), 0)
        ON CONFLICT (user_id, channel, op) DO NOTHING
      `;

      const rows = await tx<{ window_start: Date; hit_count: number }[]>`
        SELECT window_start, hit_count
          FROM notify.target_rate_windows
         WHERE user_id = ${userId}
           AND channel = ${channel}
           AND op = ${op}
         FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        // Concurrent delete of the row we just inserted is absurd; refuse closed.
        return false;
      }

      const windowAgeMs = Date.now() - row.window_start.getTime();
      if (windowAgeMs >= cfg.windowMs) {
        await tx`
          UPDATE notify.target_rate_windows
             SET window_start = now(),
                 hit_count = 1
           WHERE user_id = ${userId}
             AND channel = ${channel}
             AND op = ${op}
        `;
        return true;
      }

      if (row.hit_count >= cfg.max) {
        return false;
      }

      await tx`
        UPDATE notify.target_rate_windows
           SET hit_count = hit_count + 1
         WHERE user_id = ${userId}
           AND channel = ${channel}
           AND op = ${op}
      `;
      return true;
    });
  }

  async reset(): Promise<void> {
    await this.sql`DELETE FROM notify.target_rate_windows`;
  }
}
