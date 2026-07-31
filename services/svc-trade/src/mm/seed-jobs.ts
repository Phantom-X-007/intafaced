/**
 * Market-maker seed job assembly (trade.mm-bot residual).
 *
 * Default OFF. Never invents mid, markets, or inventory.
 * Seeds only when book depth is empty (honest reseed guard).
 * Mid comes from injected midSource (env map / oracle) — null → skip.
 */
import type { LedgerClient } from '@intafaced/ledger-client';
import type { MatchingClient } from '../spot/matching-client.js';
import { createJobHost, type JobHost } from '../futures/job-host.js';
import { seedMarket, type SeedMarketResult } from './seed-market.js';

export interface MmSeedTarget {
  marketId: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface MmSeedJobsConfig {
  /** Master kill — false = host created, no intervals. */
  enabled: boolean;
  /** Tick interval when enabled. */
  intervalMs: number;
  halfSpreadBps: number;
  stepBps: number;
  levels: number;
  qtyPerLevel: string;
  /**
   * Explicit markets to seed. Empty = job not scheduled even when enabled
   * (never invent a market list).
   */
  targets: readonly MmSeedTarget[];
}

export interface MmSeedJobsDeps {
  ledger: Pick<LedgerClient, 'post'>;
  matching: Pick<MatchingClient, 'submit' | 'depth'>;
  /**
   * External mid for a market. Null/empty → skip that market (never invent).
   */
  midSource: (marketId: string) => string | null | Promise<string | null>;
  config: MmSeedJobsConfig;
  /** Stable run id per market (default ops-seed:{marketId}). */
  runIdFor?: (marketId: string) => string;
  onError?: (name: string, err: unknown) => void;
  /** Optional observer for tests / ops logs. */
  onResult?: (marketId: string, result: SeedMarketResult | { skipped: string }) => void;
}

export interface MmSeedJobsHandle {
  host: JobHost;
  stop(): void;
}

/**
 * Assemble MM seed jobs. Disabled or empty targets → stopped host.
 */
export function startMmSeedJobs(deps: MmSeedJobsDeps): MmSeedJobsHandle {
  const host = createJobHost({ onError: deps.onError });

  if (!deps.config.enabled || deps.config.targets.length === 0) {
    return { host, stop: () => host.stopAll() };
  }

  const runIdFor = deps.runIdFor ?? ((marketId: string) => `ops-seed:${marketId}`);

  host.every('mm.seed', deps.config.intervalMs, async () => {
    for (const target of deps.config.targets) {
      if (!target.marketId.trim() || !target.baseAsset.trim() || !target.quoteAsset.trim()) {
        deps.onResult?.(target.marketId, { skipped: 'invalid_target' });
        continue;
      }

      // Only seed empty books — avoids re-submit/release race on live seed orders.
      const depth = await deps.matching.depth(target.marketId, 1);
      if (depth.bids.length > 0 || depth.asks.length > 0) {
        deps.onResult?.(target.marketId, { skipped: 'book_not_empty' });
        continue;
      }

      const mid = await deps.midSource(target.marketId);
      if (mid == null || String(mid).trim() === '') {
        deps.onResult?.(target.marketId, { skipped: 'missing_mid' });
        continue;
      }

      const result = await seedMarket(
        {
          marketId: target.marketId,
          baseAsset: target.baseAsset,
          quoteAsset: target.quoteAsset,
          midPrice: mid,
          halfSpreadBps: deps.config.halfSpreadBps,
          stepBps: deps.config.stepBps,
          levels: deps.config.levels,
          qtyPerLevel: deps.config.qtyPerLevel,
          runId: runIdFor(target.marketId),
        },
        { ledger: deps.ledger, matching: deps.matching },
      );
      deps.onResult?.(target.marketId, result);
    }
  });

  return { host, stop: () => host.stopAll() };
}

/**
 * Parse `marketId:base:quote,...` — empty → []. Invalid segments skipped.
 * Never invents markets from thin air.
 */
export function parseMmSeedTargets(raw: string | undefined): MmSeedTarget[] {
  if (raw == null || raw.trim() === '') return [];
  const out: MmSeedTarget[] = [];
  for (const part of raw.split(',')) {
    const bits = part
      .trim()
      .split(':')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (bits.length !== 3) continue;
    const [marketId, baseAsset, quoteAsset] = bits as [string, string, string];
    out.push({ marketId, baseAsset, quoteAsset });
  }
  return out;
}

/**
 * Parse `marketId:mid,...` external mid map. Empty mid values omitted.
 */
export function parseMmSeedMids(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (raw == null || raw.trim() === '') return map;
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const marketId = part.slice(0, idx).trim();
    const mid = part.slice(idx + 1).trim();
    if (!marketId || !mid) continue;
    map.set(marketId, mid);
  }
  return map;
}
