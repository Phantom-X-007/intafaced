/**
 * §28 / M22 / M25 — house execution is not tenant money and not a tenant fill.
 *
 * House desk spends the house book only. A house child cannot debit a tenant
 * book or publish a fill that looks like a tenant fill.
 * Missing tenant id refuses — never defaults to house or to a customer tenant.
 * This package holds no balances and invents no second book.
 */

export const HOUSE_MAY_SPEND_TENANT_MONEY: false = false;
export const HOUSE_FILL_MAY_LOOK_LIKE_TENANT: false = false;

export type EconomicBook = 'house' | 'tenant';

export type HouseVsTenantRefuseReason = 'missing_tenant_id' | 'spend_tenant_money' | 'looks_like_tenant_fill';

export type HouseVsTenantRefusal = {
  readonly ok: false;
  readonly reason: HouseVsTenantRefuseReason;
  readonly detail: string;
};

export type HouseVsTenantClear = {
  readonly ok: true;
  readonly tenantId: string;
  readonly spendBook: 'house';
  readonly fillLooksLike: 'house';
};

export type HouseVsTenantResult = HouseVsTenantClear | HouseVsTenantRefusal;

export type HouseExecutionAttribution = {
  readonly tenantId: string | null | undefined;
  readonly spendBook: EconomicBook;
  readonly fillLooksLike: EconomicBook;
};

export const MISSING_TENANT_ID_DETAIL =
  'M22/M25 — missing tenant id refuses; house execution never defaults to a tenant or a shared house book';

export const SPEND_TENANT_MONEY_DETAIL = 'M22/M25 — house execution must not spend tenant money';

export const LOOKS_LIKE_TENANT_FILL_DETAIL = 'M22/M25 — house execution must not look like a tenant fill';

export function tenantIdPresent(tenantId: string | null | undefined): tenantId is string {
  return typeof tenantId === 'string' && tenantId.trim().length > 0;
}

export function requireTenantId(tenantId: string | null | undefined): { ok: true; tenantId: string } | HouseVsTenantRefusal {
  if (!tenantIdPresent(tenantId)) {
    return { ok: false, reason: 'missing_tenant_id', detail: MISSING_TENANT_ID_DETAIL };
  }
  return { ok: true, tenantId: tenantId.trim() };
}

/**
 * House execution attribution gate.
 *
 * Order: missing_tenant_id → spend_tenant_money → looks_like_tenant_fill → clear.
 */
export function isolateHouseVsTenant(input: HouseExecutionAttribution): HouseVsTenantResult {
  const id = requireTenantId(input.tenantId);
  if (!id.ok) return id;

  if (input.spendBook === 'tenant') {
    return { ok: false, reason: 'spend_tenant_money', detail: SPEND_TENANT_MONEY_DETAIL };
  }

  if (input.fillLooksLike === 'tenant') {
    return { ok: false, reason: 'looks_like_tenant_fill', detail: LOOKS_LIKE_TENANT_FILL_DETAIL };
  }

  return {
    ok: true,
    tenantId: id.tenantId,
    spendBook: 'house',
    fillLooksLike: 'house',
  };
}

export type HouseFillLook = {
  readonly book: 'house';
  readonly tenantId: string;
};

/** House fills are labeled house. Missing tenant id refuses instead of a tenant-shaped fill. */
export function houseFillLook(tenantId: string | null | undefined): HouseFillLook | HouseVsTenantRefusal {
  const id = requireTenantId(tenantId);
  if (!id.ok) return id;
  return { book: 'house', tenantId: id.tenantId };
}
