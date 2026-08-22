/**
 * trade.futures owner funding + leverage env gates — refuse-closed when unset.
 */
export const TRADE_FUTURES_FUNDING_MAX_ABS_RATE_ENV = 'TRADE_FUTURES_FUNDING_MAX_ABS_RATE' as const;
export const TRADE_FUTURES_FUNDING_INTERVAL_MS_ENV = 'TRADE_FUTURES_FUNDING_INTERVAL_MS' as const;
export const TRADE_FUTURES_MAX_LEVERAGE_ENV = 'TRADE_FUTURES_MAX_LEVERAGE' as const;

export type FuturesOwnerEnvRefuseReason = 'funding_unset' | 'funding_invalid' | 'leverage_unset' | 'leverage_invalid';

export type FuturesFundingOwnerGate =
  | { readonly configured: true; readonly maxAbsRate: string; readonly intervalMs: number }
  | { readonly configured: false; readonly reason: FuturesOwnerEnvRefuseReason; readonly detail: string };

export type FuturesLeverageOwnerGate =
  | { readonly configured: true; readonly maxLeverage: string }
  | { readonly configured: false; readonly reason: FuturesOwnerEnvRefuseReason; readonly detail: string };

export function futuresFundingOwnerGate(env: NodeJS.ProcessEnv = process.env): FuturesFundingOwnerGate {
  const maxAbsRate = env[TRADE_FUTURES_FUNDING_MAX_ABS_RATE_ENV]?.trim() ?? '';
  const intervalRaw = env[TRADE_FUTURES_FUNDING_INTERVAL_MS_ENV]?.trim() ?? '';
  if (!maxAbsRate || !intervalRaw) {
    return {
      configured: false,
      reason: 'funding_unset',
      detail: 'funding ceiling and interval must both be owner-set — no invented rates/schedule',
    };
  }
  const intervalMs = Number(intervalRaw);
  if (!Number.isInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 86_400_000) {
    return { configured: false, reason: 'funding_invalid', detail: 'funding interval must be an integer 60000–86400000 ms' };
  }
  return { configured: true, maxAbsRate, intervalMs };
}

export function futuresLeverageOwnerGate(env: NodeJS.ProcessEnv = process.env): FuturesLeverageOwnerGate {
  const raw = env[TRADE_FUTURES_MAX_LEVERAGE_ENV]?.trim() ?? '';
  if (!raw) {
    return { configured: false, reason: 'leverage_unset', detail: `${TRADE_FUTURES_MAX_LEVERAGE_ENV} is unset` };
  }
  if (!/^\d+$/.test(raw) || raw === '0') {
    return { configured: false, reason: 'leverage_invalid', detail: 'max leverage must be a positive integer string' };
  }
  return { configured: true, maxLeverage: raw };
}
