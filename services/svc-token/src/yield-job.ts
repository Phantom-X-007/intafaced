/**
 * §4.3 weekly yield job — read house fee pots, then distribute.
 *
 * `runYieldWindow` takes `{ windowId }` only. Amounts are `ledger.balance(
 * houseFees(module, assetId) )` for the closed fee-module set. Caller-typed
 * `sources[].amount` is refused: inventing a fee total is how T-03 used to
 * over-claim a pot.
 *
 * Unset / off (`YIELD_JOB_ENABLED=false`) is `token.yield_job_unset`. Blank
 * `YIELD_DISTRIBUTION_CRON_HOURS` is the same code — `168` is a live weekly
 * magnitude, never a git default. Zero pots is `token.nothing_to_distribute`
 * — that is a real empty reading, not an invented zero.
 */
import { houseFees, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import { TokenError, type YieldRunResult } from './token-service.js';

/**
 * Modules whose `houseFees(<module>)` pot the job may read.
 * Lockstep with `FEE_REVENUE_PATHS[].feeModule` — not an operator list.
 */
export const YIELD_SOURCE_MODULES = ['bank', 'market', 'p2p', 'pay', 'trade'] as const;
export type YieldSourceModule = (typeof YIELD_SOURCE_MODULES)[number];

export interface YieldJobDeps {
  readonly yieldJobEnabled: boolean;
  /**
   * Owner-present cadence in hours. `undefined` is unset — never treat 168
   * as implicit weekly.
   */
  readonly yieldDistributionCronHours: number | undefined;
  readonly assetId: string;
  readonly ledger: LedgerClient;
  readonly distributeRevenue: (input: {
    windowId: string;
    sources: ReadonlyArray<{ module: string; amount: Amount }>;
  }) => Promise<YieldRunResult>;
}

/**
 * Read owner cron hours. Missing / blank / non-integer / below 1 is unset —
 * never coerced to 168.
 */
export function readYieldDistributionCronHours(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const hours = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(hours) || hours < 1) return undefined;
  return hours;
}

export interface YieldWindowInput {
  readonly windowId: string;
}

export async function runYieldWindow(deps: YieldJobDeps, input: YieldWindowInput): Promise<YieldRunResult> {
  if (input !== null && typeof input === 'object' && 'sources' in input) {
    throw new TokenError(
      'Yield job does not accept caller-typed sources — amounts come from ledger.balance(houseFees)',
      'token.yield_job_unset',
    );
  }
  if (!deps.yieldJobEnabled) {
    throw new TokenError('Yield aggregation job is unset (YIELD_JOB_ENABLED=false)', 'token.yield_job_unset');
  }
  if (deps.yieldDistributionCronHours === undefined) {
    throw new TokenError('YIELD_DISTRIBUTION_CRON_HOURS is unset — refusing to invent a weekly cadence', 'token.yield_job_unset');
  }

  const sources: Array<{ module: string; amount: Amount }> = [];
  for (const module of YIELD_SOURCE_MODULES) {
    const held = (await deps.ledger.balance(houseFees(module, deps.assetId))).amount;
    if (held > 0n) sources.push({ module, amount: held });
  }
  if (sources.length === 0) {
    throw new TokenError('No revenue to distribute for this window', 'token.nothing_to_distribute');
  }

  return deps.distributeRevenue({ windowId: input.windowId, sources });
}
