import { TAX_EXPORT_INCOMPLETE, TAX_JURISDICTION_MAP_INVALID, TAX_JURISDICTION_UNMAPPED, TaxError } from './codes.js';

const REGION = /^[A-Z]{2}$/;

export type JurisdictionMap = { readonly kind: 'unmapped' } | { readonly kind: 'mapped'; readonly regions: ReadonlySet<string> };

/**
 * Parse owner/counsel JSON. Blank, `{}`, `[]` → unmapped (never a default country).
 * Invalid JSON is a distinct refuse so a typo is not silent.
 */
export function parseJurisdictionMap(raw: string | undefined | null): JurisdictionMap {
  const text = (raw ?? '').trim();
  if (text.length === 0) return { kind: 'unmapped' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new TaxError(TAX_JURISDICTION_MAP_INVALID, 'TAX_JURISDICTION_MAP_JSON is not valid JSON');
  }

  const regions = new Set<string>();
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item !== 'string' || !REGION.test(item)) {
        throw new TaxError(TAX_JURISDICTION_MAP_INVALID, 'TAX_JURISDICTION_MAP_JSON array entries must be ISO-3166 alpha-2');
      }
      regions.add(item);
    }
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const key of Object.keys(parsed)) {
      if (!REGION.test(key)) {
        throw new TaxError(TAX_JURISDICTION_MAP_INVALID, 'TAX_JURISDICTION_MAP_JSON keys must be ISO-3166 alpha-2');
      }
      regions.add(key);
    }
  } else {
    throw new TaxError(TAX_JURISDICTION_MAP_INVALID, 'TAX_JURISDICTION_MAP_JSON must be an object or array of region codes');
  }

  if (regions.size === 0) return { kind: 'unmapped' };
  return { kind: 'mapped', regions };
}

export function requireMappedRegion(map: JurisdictionMap, region: string): string {
  const code = region.trim().toUpperCase();
  if (map.kind === 'unmapped' || !REGION.test(code) || !map.regions.has(code)) {
    throw new TaxError(
      TAX_JURISDICTION_UNMAPPED,
      'No counsel jurisdiction map for this region — owner TAX_JURISDICTION_MAP_JSON is blank or does not include it. Never default a country.',
    );
  }
  return code;
}

/**
 * Completeness of tax coverage is the owner map. This service never certifies
 * a complete export and never invents jurisdictions to fill one. No env unblocks
 * `complete: true`.
 */
export function refuseExportCompleteness(claim: boolean | undefined): void {
  if (claim === true) {
    throw new TaxError(
      TAX_EXPORT_INCOMPLETE,
      'Tax export completeness is OWNER map — never certified complete, never invent jurisdictions',
    );
  }
}
