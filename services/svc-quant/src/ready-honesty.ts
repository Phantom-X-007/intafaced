import { z } from 'zod';
import { QUANT_BACKTEST_LAKE_MISSING, QUANT_SANDBOX_UNWIRED } from './errors.js';

/**
 * GET /ready must not sell isolate as wired when the lake is missing.
 * Isolate (sandbox VM) wired is not lake wired. Process liveness stays ready:true.
 */
export const quantReadyHonestySchema = z.object({
  ready: z.literal(true),
  custodial: z.literal(false),
  isolate: z.enum(['wired', 'unwired']),
  lake: z.enum(['wired', 'missing']),
  refuse: z.enum([QUANT_BACKTEST_LAKE_MISSING, QUANT_SANDBOX_UNWIRED]).nullable(),
  venueVault: z.enum(['trade-only', 'unset']),
});

export type QuantReadyHonesty = z.infer<typeof quantReadyHonestySchema>;

export function quantReadyHonesty(input: { isolateWired: boolean; lakeWired: boolean; venueVaultSet: boolean }): QuantReadyHonesty {
  const lake = input.lakeWired ? ('wired' as const) : ('missing' as const);
  const isolate = input.isolateWired && input.lakeWired ? ('wired' as const) : ('unwired' as const);
  const refuse = !input.lakeWired ? QUANT_BACKTEST_LAKE_MISSING : input.isolateWired ? null : QUANT_SANDBOX_UNWIRED;
  return {
    ready: true,
    custodial: false,
    isolate,
    lake,
    refuse,
    venueVault: input.venueVaultSet ? ('trade-only' as const) : ('unset' as const),
  };
}
