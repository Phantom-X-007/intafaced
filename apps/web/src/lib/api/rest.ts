import { z } from 'zod';
import type { EdgeClient } from './edge-client';
import { failure, type Result } from '../result';

/**
 * CCXT REST via svc-edge `/api/v1/*` (preservePath → svc-trade).
 *
 * Separate from tRPC: bots and the terminal share this contract. Amounts stay
 * decimal strings. Public routes need no bearer; private routes use the edge
 * client's in-memory session token.
 */

const ohlcvRowSchema = z.tuple([z.number().int().nonnegative(), z.string(), z.string(), z.string(), z.string(), z.string()]);

export type OhlcvRow = z.infer<typeof ohlcvRowSchema>;

const balanceEntrySchema = z.object({
  free: z.string(),
  used: z.string(),
  total: z.string(),
});

export const balancesSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  datetime: z.string(),
  balances: z.record(z.string(), balanceEntrySchema),
});

export type AccountBalances = z.infer<typeof balancesSchema>;

/** Public. Honest `[]` when the market has never traded — never invent candles. */
export function fetchOhlcv(
  edge: EdgeClient,
  symbol: string,
  opts: { timeframe?: string; limit?: number } = {},
): Promise<Result<OhlcvRow[]>> {
  const q = new URLSearchParams();
  if (opts.timeframe) q.set('timeframe', opts.timeframe);
  if (opts.limit !== undefined) q.set('limit', String(opts.limit));
  const qs = q.toString();
  const path = `/api/v1/ohlcv/${encodeURIComponent(symbol)}${qs ? `?${qs}` : ''}`;
  return edge.restGet(path, z.array(ohlcvRowSchema), { auth: false });
}

/** Private. Self-only ledger projection; empty `{}` when the user has no balances. */
export function fetchAccountBalance(edge: EdgeClient, signedIn: boolean): Promise<Result<AccountBalances>> {
  if (!signedIn) {
    return Promise.resolve(failure('trade', '/api/v1/account/balance', 'unauthenticated', 'sign in to read balances'));
  }
  return edge.restGet('/api/v1/account/balance', balancesSchema, { auth: true });
}
