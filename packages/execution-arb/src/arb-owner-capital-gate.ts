/**
 * execution.arbitrage owner capital / freshness magnitudes — refuse-closed when unset.
 *
 * Owner publishes max quote age (ms) for arb scans. Never invents a freshness window.
 */
export const EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV = 'EXECUTION_ARB_MAX_QUOTE_AGE_MS' as const;

export type ArbCapitalRefuseReason = 'capital_unset' | 'capital_invalid';

export type ArbCapitalGate =
  | { readonly configured: true; readonly maxQuoteAgeMs: number }
  | { readonly configured: false; readonly reason: ArbCapitalRefuseReason; readonly detail: string };

export function arbCapitalGate(env: NodeJS.ProcessEnv = process.env): ArbCapitalGate {
  const raw = env[EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV]?.trim() ?? '';
  if (!raw) {
    return {
      configured: false,
      reason: 'capital_unset',
      detail: `${EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV} is unset`,
    };
  }

  const maxQuoteAgeMs = Number(raw);
  if (!Number.isInteger(maxQuoteAgeMs) || maxQuoteAgeMs < 0) {
    return {
      configured: false,
      reason: 'capital_invalid',
      detail: `${EXECUTION_ARB_MAX_QUOTE_AGE_MS_ENV} must be a non-negative integer ms`,
    };
  }

  return { configured: true, maxQuoteAgeMs };
}
