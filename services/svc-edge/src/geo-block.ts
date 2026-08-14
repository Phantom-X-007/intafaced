/**
 * EDGE GEO-BLOCK DOOR — empty screening is unknown, not a clearance.
 *
 * `packages/config` screening already distinguishes unset / listed /
 * reviewed-empty. The hosted front-end still forwarded `/api/*` without asking,
 * so an empty list and a geo-cleared region looked the same on the wire.
 *
 * This door refuses with a typed code when there is no list content to screen
 * against. It does not invent JURISDICTION_MATRIX `blocked: true` rows or
 * counsel sanctions codes (Class X).
 */

import { envScreeningList, type ScreeningDeclaration, type ScreeningList } from '@intafaced/config';

export const GEO_BLOCK_UNSET_CODE = 'edge.screening_unset' as const;
export const GEO_BLOCK_EMPTY_CODE = 'edge.screening_empty' as const;
export const GEO_BLOCK_HIT_CODE = 'edge.geo_blocked' as const;
export const GEO_BLOCK_SCREENED_CODE = 'edge.geo_screened' as const;

export type GeoBlockRefuseCode = typeof GEO_BLOCK_UNSET_CODE | typeof GEO_BLOCK_EMPTY_CODE | typeof GEO_BLOCK_HIT_CODE;

export type GeoBlockDecision =
  | {
      readonly allowed: false;
      readonly code: typeof GEO_BLOCK_UNSET_CODE;
      readonly reason: 'screening_unset';
      readonly region: string;
      readonly screeningDeclaration: ScreeningDeclaration;
      readonly screeningConfigured: boolean;
      readonly screeningSource: string;
      readonly listHitCount: 0;
      readonly inventedBlockedList: false;
    }
  | {
      readonly allowed: false;
      readonly code: typeof GEO_BLOCK_EMPTY_CODE;
      readonly reason: 'screening_empty';
      readonly region: string;
      readonly screeningDeclaration: ScreeningDeclaration;
      readonly screeningConfigured: boolean;
      readonly screeningSource: string;
      readonly listHitCount: 0;
      readonly inventedBlockedList: false;
    }
  | {
      readonly allowed: false;
      readonly code: typeof GEO_BLOCK_HIT_CODE;
      readonly reason: 'region_listed';
      readonly region: string;
      readonly screeningDeclaration: 'listed';
      readonly screeningConfigured: true;
      readonly screeningSource: string;
      readonly listHitCount: number;
      readonly hitReason: string;
      readonly inventedBlockedList: false;
    }
  | {
      readonly allowed: true;
      readonly code: typeof GEO_BLOCK_SCREENED_CODE;
      readonly reason: 'region_not_listed';
      readonly region: string;
      readonly screeningDeclaration: 'listed';
      readonly screeningConfigured: true;
      readonly screeningSource: string;
      readonly listHitCount: 0;
      readonly inventedBlockedList: false;
    };

export type GeoBlockInput = {
  readonly region: string;
  /** Test seam. Production uses `envScreeningList()`. */
  readonly screening?: ScreeningList;
};

function normalizeRegion(region: string): string {
  return region.trim().toUpperCase().slice(0, 2);
}

/**
 * Evaluate geo-block for one request region against counsel-supplied screening.
 *
 * Unset / empty content → unknown (typed refuse). Never `allowed` in those
 * states. A listed miss is a real screen, not a default green tick.
 */
export function evaluateGeoBlock(input: GeoBlockInput): GeoBlockDecision {
  const screening = input.screening ?? envScreeningList();
  const region = normalizeRegion(input.region);

  if (screening.declaration === 'unset' || screening.configured === false) {
    return {
      allowed: false,
      code: GEO_BLOCK_UNSET_CODE,
      reason: 'screening_unset',
      region,
      screeningDeclaration: screening.declaration,
      screeningConfigured: false,
      screeningSource: screening.source,
      listHitCount: 0,
      inventedBlockedList: false,
    };
  }

  if (screening.declaration === 'reviewed-empty' || screening.regions.length === 0) {
    return {
      allowed: false,
      code: GEO_BLOCK_EMPTY_CODE,
      reason: 'screening_empty',
      region,
      screeningDeclaration: screening.declaration,
      screeningConfigured: screening.configured,
      screeningSource: screening.source,
      listHitCount: 0,
      inventedBlockedList: false,
    };
  }

  const hits = screening.regions.filter((row) => row.region === region);
  if (hits.length > 0) {
    return {
      allowed: false,
      code: GEO_BLOCK_HIT_CODE,
      reason: 'region_listed',
      region,
      screeningDeclaration: 'listed',
      screeningConfigured: true,
      screeningSource: screening.source,
      listHitCount: hits.length,
      hitReason: hits[0]?.reason ?? '',
      inventedBlockedList: false,
    };
  }

  return {
    allowed: true,
    code: GEO_BLOCK_SCREENED_CODE,
    reason: 'region_not_listed',
    region,
    screeningDeclaration: 'listed',
    screeningConfigured: true,
    screeningSource: screening.source,
    listHitCount: 0,
    inventedBlockedList: false,
  };
}

/** Empty / unconfigured screening rendered as a geo-clearance. */
export function looksLikeGeoClearance(result: GeoBlockDecision | Record<string, unknown>): boolean {
  const declaration = 'screeningDeclaration' in result ? result.screeningDeclaration : undefined;
  const configured = 'screeningConfigured' in result ? result.screeningConfigured : undefined;
  const emptyState = declaration === 'unset' || declaration === 'reviewed-empty' || configured === false;

  if (emptyState && 'allowed' in result && result.allowed === true) return true;
  if (emptyState && 'blocked' in result && result.blocked === false) return true;
  if (emptyState && 'status' in result && result.status === 'ok') return true;
  if (emptyState && 'code' in result && result.code === GEO_BLOCK_SCREENED_CODE) return true;
  if (emptyState && 'code' in result && typeof result.code === 'string' && result.code.startsWith('allowed')) return true;
  return false;
}

/** Invented `blocked: true` list (this door must not return one). */
export function inventedBlockedTrueList(result: GeoBlockDecision | Record<string, unknown>): boolean {
  if ('inventedBlockedList' in result && result.inventedBlockedList === true) return true;
  if (!('blocked' in result)) return false;
  const blocked = result.blocked;
  if (blocked === true) return true;
  if (!Array.isArray(blocked)) return false;
  return blocked.some(
    (row) => row && typeof row === 'object' && 'blocked' in row && (row as { blocked: unknown }).blocked === true,
  );
}

export function geoBlockHttpStatus(decision: GeoBlockDecision): number {
  if (decision.code === GEO_BLOCK_HIT_CODE) return 403;
  if (decision.allowed) return 200;
  return 503;
}

export function geoBlockOpsHttpStatus(decision: GeoBlockDecision): number {
  if (decision.code === GEO_BLOCK_UNSET_CODE || decision.code === GEO_BLOCK_EMPTY_CODE) return 409;
  if (decision.code === GEO_BLOCK_HIT_CODE) return 403;
  return 200;
}

export function geoBlockPublicBody(decision: GeoBlockDecision): Record<string, unknown> {
  return {
    error: geoBlockErrorMessage(decision),
    code: decision.code,
    reason: decision.reason,
    screeningDeclaration: decision.screeningDeclaration,
    screeningConfigured: decision.screeningConfigured,
    inventedBlockedList: false,
  };
}

export function geoBlockErrorMessage(decision: GeoBlockDecision): string {
  if (decision.code === GEO_BLOCK_UNSET_CODE) {
    return 'geo-block: screening list is unset — unknown, not geo-cleared. Counsel must supply list content (Class X).';
  }
  if (decision.code === GEO_BLOCK_EMPTY_CODE) {
    return 'geo-block: screening list is empty — unknown, not a geo-clearance. Empty content cannot clear a region.';
  }
  if (decision.code === GEO_BLOCK_HIT_CODE) {
    return `geo-block: region ${decision.region} is on the configured screening list.`;
  }
  return `geo-block: region ${decision.region} screened against a listed set.`;
}
