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
 * In-memory sliding window, keyed on `userId\0channel\0op`. Good enough for a
 * single replica. Multi-replica residual: each process holds its own counters,
 * so N replicas allow roughly N× the budget until a shared store (Redis /
 * Postgres) lands. Documented, not hidden — the limit is still a hard stop per
 * process, not a silent no-op.
 *
 * Named refuse codes (not a generic 429 body) so the client can render "try
 * later" without inventing copy: `channel.register_rate_limited` /
 * `channel.verify_rate_limited`.
 */

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
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

export class TargetRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly registerCfg: TargetRateLimitConfig;
  private readonly verifyCfg: TargetRateLimitConfig;
  private readonly now: () => number;

  constructor(opts: TargetRateLimiterOptions = {}) {
    this.registerCfg = opts.register ?? DEFAULT_REGISTER_LIMIT;
    this.verifyCfg = opts.verify ?? DEFAULT_VERIFY_LIMIT;
    this.now = opts.now ?? Date.now;
  }

  /**
   * True when the call is allowed (and this take is recorded). False when the
   * window is full — caller must refuse with the named code and MUST NOT send
   * or check a code.
   */
  tryTake(userId: string, channel: ChannelId, op: TargetRateOp): boolean {
    const cfg = op === 'register' ? this.registerCfg : this.verifyCfg;
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

  /** Test helper — clear all windows. */
  reset(): void {
    this.hits.clear();
  }
}
