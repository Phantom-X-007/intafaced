import { parseAmount } from '@intafaced/ledger-client/money';
import type { SimulatedPerformanceStamp } from '@intafaced/quant-honesty';
import { QuantError } from '../errors.js';
import { requireSimulatedStamp } from '../honesty.js';

export interface MarketplaceClaimInput {
  readonly strategyId: string;
  readonly environment?: string | null;
  readonly presentedAs?: string | null;
  readonly pnl?: string;
}

export type MarketplaceClaim = SimulatedPerformanceStamp & {
  readonly ok: true;
  readonly strategyId: string;
  readonly pnl?: string;
};

/** Marketplace listing of simulated/paper PnL — stamp or refuse; never "live". */
export function claimMarketplace(input: MarketplaceClaimInput): MarketplaceClaim {
  const strategyId = input.strategyId.trim();
  if (!strategyId) throw new QuantError('quant.params_invalid', 'strategyId is required');

  const stamp = requireSimulatedStamp(input.environment, input.presentedAs);

  if (input.pnl !== undefined) {
    try {
      parseAmount(input.pnl);
    } catch {
      throw new QuantError('quant.params_invalid', 'pnl must be a decimal string');
    }
  }

  return {
    ok: true,
    strategyId,
    ...stamp,
    ...(input.pnl !== undefined ? { pnl: input.pnl } : {}),
  };
}
