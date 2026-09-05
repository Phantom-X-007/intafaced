import { z } from 'zod';
import type { ChainPosture } from './rails/chain-port.js';

/**
 * `/ready` never probes the chain. `EvmLiveChain` constructor + rail send do.
 *
 * `chain: 'live EVM chain id=31337 rpc=…'` sold configured `PAY_CRYPTO_CHAIN_ID`
 * + `PAY_CRYPTO_RPC_URL` as a live chain. Process readiness stays `ready: true`.
 * Configured / unprobed is not chain ok — no `chainId` field, `observedChainId`
 * is null. `posture: live` on the port still means outbound would be real money.
 *
 * `pay.chain_not_configured` matches `ChainNotConfiguredError` — same refuse.
 */
export const PAY_CHAIN_UNPROBED = 'pay.chain_unprobed' as const;
export const PAY_CHAIN_SANDBOX = 'pay.chain_sandbox' as const;
export const PAY_CHAIN_NOT_CONFIGURED = 'pay.chain_not_configured' as const;

export const payChainReadyHonestySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('configured'),
    code: z.literal(PAY_CHAIN_UNPROBED),
    observedChainId: z.null(),
  }),
  z.object({
    status: z.literal('sandbox'),
    code: z.literal(PAY_CHAIN_SANDBOX),
    observedChainId: z.null(),
  }),
  z.object({
    status: z.literal('absent'),
    code: z.literal(PAY_CHAIN_NOT_CONFIGURED),
    observedChainId: z.null(),
  }),
]);

export type PayChainReadyHonesty = z.infer<typeof payChainReadyHonestySchema>;

export function payChainReadyHonesty(posture: ChainPosture): PayChainReadyHonesty {
  if (posture === 'absent') {
    return { status: 'absent', code: PAY_CHAIN_NOT_CONFIGURED, observedChainId: null };
  }
  if (posture === 'sandbox') {
    return { status: 'sandbox', code: PAY_CHAIN_SANDBOX, observedChainId: null };
  }
  return { status: 'configured', code: PAY_CHAIN_UNPROBED, observedChainId: null };
}
