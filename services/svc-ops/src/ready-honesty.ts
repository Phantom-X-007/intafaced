import { z } from 'zod';
import { OPS_IDENTITY_UNWIRED, OPS_SUPPORT_UNWIRED } from './codes.js';

/**
 * GET /ready never probes identity or support.
 *
 * `identityUrl: Boolean(IDENTITY_URL)` sold a set env URL as a live peer
 * next to `ready: true`. A URL is config. This process does not fetch.
 * Blank stays `ops.identity_unwired` / `ops.support_unwired`.
 */
export const OPS_IDENTITY_UNPROBED = 'ops.identity_unprobed' as const;
export const OPS_SUPPORT_UNPROBED = 'ops.support_unprobed' as const;

export const identityHonestySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('absent'), code: z.literal(OPS_IDENTITY_UNWIRED) }),
  z.object({ status: z.literal('configured'), code: z.literal(OPS_IDENTITY_UNPROBED) }),
]);

export const supportHonestySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('absent'), code: z.literal(OPS_SUPPORT_UNWIRED) }),
  z.object({ status: z.literal('configured'), code: z.literal(OPS_SUPPORT_UNPROBED) }),
]);

export type IdentityHonesty = z.infer<typeof identityHonestySchema>;
export type SupportHonesty = z.infer<typeof supportHonestySchema>;

function urlIsSet(url: string | undefined): boolean {
  return (url?.trim() ?? '').length > 0;
}

export function identityUrlHonesty(url: string | undefined): IdentityHonesty {
  if (!urlIsSet(url)) return { status: 'absent', code: OPS_IDENTITY_UNWIRED };
  return { status: 'configured', code: OPS_IDENTITY_UNPROBED };
}

export function supportUrlHonesty(url: string | undefined): SupportHonesty {
  if (!urlIsSet(url)) return { status: 'absent', code: OPS_SUPPORT_UNWIRED };
  return { status: 'configured', code: OPS_SUPPORT_UNPROBED };
}

/** Public pair: env URL vs the thing this process does not probe. */
export function opsReadyUrlHonesty(env: { IDENTITY_URL?: string; SUPPORT_URL?: string }): {
  identityUrlConfigured: boolean;
  supportUrlConfigured: boolean;
  identity: IdentityHonesty;
  support: SupportHonesty;
} {
  return {
    identityUrlConfigured: urlIsSet(env.IDENTITY_URL),
    supportUrlConfigured: urlIsSet(env.SUPPORT_URL),
    identity: identityUrlHonesty(env.IDENTITY_URL),
    support: supportUrlHonesty(env.SUPPORT_URL),
  };
}
