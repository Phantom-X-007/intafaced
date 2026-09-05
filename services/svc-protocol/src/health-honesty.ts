import { z } from 'zod';

/**
 * Health never probes the chain. `chainStatus` does.
 *
 * `ok: true, chainId: 31337` sold Anvil's env default as a live chain. Process
 * liveness stays `ok: true`. Configured / unprobed is not chain ok — no
 * `chainId` field, `observedChainId` is null.
 */
export const PROTOCOL_CHAIN_UNPROBED = 'protocol.chain_unprobed' as const;

export const protocolHealthHonestySchema = z.object({
  ok: z.literal(true),
  service: z.literal('svc-protocol'),
  custodial: z.literal(false),
  relayEnabled: z.boolean(),
  /** Both factory and implementation env addresses are non-zero. Config, not `eth_getCode`. */
  factoryConfigured: z.boolean(),
  venueVaultConfigured: z.boolean().optional(),
  chain: z.object({
    status: z.literal('unprobed'),
    code: z.literal(PROTOCOL_CHAIN_UNPROBED),
    observedChainId: z.null(),
  }),
});

export type ProtocolHealthHonesty = z.infer<typeof protocolHealthHonestySchema>;

export function protocolHealthHonesty(input: {
  relayEnabled: boolean;
  factoryConfigured: boolean;
  venueVaultConfigured?: boolean;
}): ProtocolHealthHonesty {
  return {
    ok: true,
    service: 'svc-protocol',
    custodial: false,
    relayEnabled: input.relayEnabled,
    factoryConfigured: input.factoryConfigured,
    ...(input.venueVaultConfigured === undefined ? {} : { venueVaultConfigured: input.venueVaultConfigured }),
    chain: {
      status: 'unprobed',
      code: PROTOCOL_CHAIN_UNPROBED,
      observedChainId: null,
    },
  };
}
