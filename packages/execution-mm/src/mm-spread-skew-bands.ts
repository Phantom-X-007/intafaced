/**
 * execution.market-making owner spread/skew bands — refuse-closed when unset (D-S-14).
 *
 * Owner publishes inclusive bps bounds for half-spread and inventory skew magnitudes.
 * This module never invents DEFAULT_THRESHOLDS or default band widths.
 */
export const EXECUTION_MM_SPREAD_SKEW_BANDS_ENV = 'EXECUTION_MM_SPREAD_SKEW_BANDS' as const;

export type MmSpreadSkewBands = Readonly<{
  minHalfSpreadBps: number;
  maxHalfSpreadBps: number;
  minInventorySkewBps: number;
  maxInventorySkewBps: number;
}>;

export type MmSpreadSkewBandsRefuseReason =
  'bands_unset' | 'bands_invalid_json' | 'bands_incomplete' | 'half_spread_out_of_band' | 'inventory_skew_out_of_band';

export type MmSpreadSkewBandsGate =
  | { readonly configured: true; readonly bands: MmSpreadSkewBands }
  | { readonly configured: false; readonly reason: MmSpreadSkewBandsRefuseReason; readonly detail: string };

function parseBoundedInt(
  obj: Record<string, unknown>,
  key: string,
  label: string,
): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly detail: string } {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, detail: `${label} must be an integer bps magnitude` };
  }
  return { ok: true, value };
}

/** Parse owner bands from env. Blank → refuse with bands_unset. */
export function mmSpreadSkewBandsGate(env: NodeJS.ProcessEnv = process.env): MmSpreadSkewBandsGate {
  const raw = env[EXECUTION_MM_SPREAD_SKEW_BANDS_ENV]?.trim() ?? '';
  if (!raw) {
    return { configured: false, reason: 'bands_unset', detail: `${EXECUTION_MM_SPREAD_SKEW_BANDS_ENV} is unset` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { configured: false, reason: 'bands_invalid_json', detail: 'spread/skew bands are not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { configured: false, reason: 'bands_invalid_json', detail: 'spread/skew bands must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;
  const minHalf = parseBoundedInt(obj, 'minHalfSpreadBps', 'minHalfSpreadBps');
  if (!minHalf.ok) return { configured: false, reason: 'bands_incomplete', detail: minHalf.detail };
  const maxHalf = parseBoundedInt(obj, 'maxHalfSpreadBps', 'maxHalfSpreadBps');
  if (!maxHalf.ok) return { configured: false, reason: 'bands_incomplete', detail: maxHalf.detail };
  const minSkew = parseBoundedInt(obj, 'minInventorySkewBps', 'minInventorySkewBps');
  if (!minSkew.ok) return { configured: false, reason: 'bands_incomplete', detail: minSkew.detail };
  const maxSkew = parseBoundedInt(obj, 'maxInventorySkewBps', 'maxInventorySkewBps');
  if (!maxSkew.ok) return { configured: false, reason: 'bands_incomplete', detail: maxSkew.detail };

  if (minHalf.value < 0 || maxHalf.value < minHalf.value) {
    return { configured: false, reason: 'bands_incomplete', detail: 'half-spread bounds must be non-negative with min ≤ max' };
  }
  if (minSkew.value > maxSkew.value) {
    return { configured: false, reason: 'bands_incomplete', detail: 'inventory skew bounds must have min ≤ max' };
  }

  return {
    configured: true,
    bands: {
      minHalfSpreadBps: minHalf.value,
      maxHalfSpreadBps: maxHalf.value,
      minInventorySkewBps: minSkew.value,
      maxInventorySkewBps: maxSkew.value,
    },
  };
}

export function validateMmOwnerSpreadSkew(
  bands: MmSpreadSkewBands,
  halfSpreadBps: number,
  inventorySkewBps: number,
): { readonly ok: true } | { readonly ok: false; readonly reason: MmSpreadSkewBandsRefuseReason; readonly detail: string } {
  if (!Number.isInteger(halfSpreadBps) || halfSpreadBps < bands.minHalfSpreadBps || halfSpreadBps > bands.maxHalfSpreadBps) {
    return {
      ok: false,
      reason: 'half_spread_out_of_band',
      detail: `halfSpreadBps ${halfSpreadBps} outside owner band [${bands.minHalfSpreadBps}, ${bands.maxHalfSpreadBps}]`,
    };
  }
  if (!Number.isInteger(inventorySkewBps) || inventorySkewBps < bands.minInventorySkewBps || inventorySkewBps > bands.maxInventorySkewBps) {
    return {
      ok: false,
      reason: 'inventory_skew_out_of_band',
      detail: `inventorySkewBps ${inventorySkewBps} outside owner band [${bands.minInventorySkewBps}, ${bands.maxInventorySkewBps}]`,
    };
  }
  return { ok: true };
}
