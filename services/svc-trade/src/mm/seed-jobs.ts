/**
 * Market-maker seed job assembly (trade.mm-bot residual).
 *
 * Default OFF. Never invents mid, markets, or inventory.
 * Seeds only when book depth is empty (honest reseed guard).
 * Mid comes from injected midSource (env map / oracle) — null → skip.
 *
 * Cancel/reseed lifecycle (A-TRADE-MM-2):
 * - Tracks last seed run per market.
 * - On empty book: cancel prior run (engine cancel + release remaining holds),
 *   then seed with a NEW runId (hold keys are per-order and idempotent).
 * - Prior cancel indeterminate → skip reseed this tick (no free book risk).
 */
import type { LedgerClient } from '@intafaced/ledger-client';
import type { MatchingClient } from '../spot/matching-client.js';
import { createJobHost, type JobHost } from '../futures/job-host.js';
import { cancelSeedMarket, seedMarket, type CancelSeedResult, type SeedMarketResult } from './seed-market.js';

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
  ledger: Pick<LedgerClient, 'post' | 'balance'>;
  matching: Pick<MatchingClient, 'submit' | 'depth' | 'cancel'>;
  /**
   * External mid for a market. Null/empty → skip that market (never invent).
   */
  midSource: (marketId: string) => string | null | Promise<string | null>;
  config: MmSeedJobsConfig;
  /**
   * Run id per seed cycle. Must be unique per cycle so holds re-draw after
   * cancel (default: ops-seed:{marketId}:{generation}).
   */
  runIdFor?: (marketId: string) => string;
  onError?: (name: string, err: unknown) => void;
  /** Optional observer for tests / ops logs. */
  onResult?: (marketId: string, result: SeedMarketResult | { skipped: string }) => void;
  /** Optional observer for prior-run cancel before reseed. */
  onCancelResult?: (marketId: string, result: CancelSeedResult) => void;
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

  /** Prior seed run per market — cancelled before reseed when book empty. */
  const lastRun = new Map<string, { runId: string; levels: number }>();
  let generation = 0;
  const runIdFor =
    deps.runIdFor ??
    ((marketId: string) => {
      generation += 1;
      return `ops-seed:${marketId}:${generation}`;
    });

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

      // Cancel prior seed: engine may already be empty (fills/cancels);
      // still release any leftover MM holds before a new runId draws again.
      const prior = lastRun.get(target.marketId);
      if (prior) {
        const cancelResult = await cancelSeedMarket(
          {
            marketId: target.marketId,
            baseAsset: target.baseAsset,
            quoteAsset: target.quoteAsset,
            levels: prior.levels,
            runId: prior.runId,
          },
          { ledger: deps.ledger, matching: deps.matching },
        );
        deps.onCancelResult?.(target.marketId, cancelResult);
        if (!cancelResult.ok) {
          deps.onResult?.(target.marketId, { skipped: `prior_${cancelResult.reason}` });
          continue;
        }
        lastRun.delete(target.marketId);
      }

      const runId = runIdFor(target.marketId);
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
          runId,
        },
        { ledger: deps.ledger, matching: deps.matching },
      );

      // Track runs that may leave live orders or stranded holds for cancel path.
      const trackable = result.placements.some(
        (p) => p.status === 'resting' || p.status === 'submit_indeterminate' || p.status === 'rejected',
      );
      if (trackable) {
        lastRun.set(target.marketId, { runId, levels: deps.config.levels });
      }

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
