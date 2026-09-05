import { z } from 'zod';
import { TAX_JURISDICTION_UNMAPPED } from './codes.js';
import { parseJurisdictionMap } from './jurisdiction-map.js';

/**
 * GET /ready never sells JSON-set as a counsel map.
 *
 * `jurisdictionMapped: trim().length > 0` treated `{}` / `[]` as mapped.
 * `parseJurisdictionMap` already calls those unmapped. Process liveness stays
 * `ready: true`. No `jurisdictionMapped` boolean.
 */
export const TAX_JURISDICTION_READY_UNMAPPED = TAX_JURISDICTION_UNMAPPED;

export const taxJurisdictionReadyHonestySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unmapped'),
    code: z.literal(TAX_JURISDICTION_UNMAPPED),
    regionCount: z.literal(0),
  }),
  z.object({
    status: z.literal('mapped'),
    regionCount: z.number().int().positive(),
  }),
]);

export type TaxJurisdictionReadyHonesty = z.infer<typeof taxJurisdictionReadyHonestySchema>;

export function taxJurisdictionReadyHonesty(raw: string | undefined | null): TaxJurisdictionReadyHonesty {
  const map = parseJurisdictionMap(raw);
  if (map.kind === 'unmapped') {
    return { status: 'unmapped', code: TAX_JURISDICTION_UNMAPPED, regionCount: 0 };
  }
  return { status: 'mapped', regionCount: map.regions.size };
}

export function taxReadyHonesty(env: { TAX_JURISDICTION_MAP_JSON?: string }): {
  ready: true;
  custodial: false;
  jurisdiction: TaxJurisdictionReadyHonesty;
} {
  return {
    ready: true,
    custodial: false,
    jurisdiction: taxJurisdictionReadyHonesty(env.TAX_JURISDICTION_MAP_JSON),
  };
}
