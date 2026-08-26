import { describe, expect, it } from 'vitest';
import {
  HOUSE_FILL_MAY_LOOK_LIKE_TENANT,
  HOUSE_MAY_SPEND_TENANT_MONEY,
  LOOKS_LIKE_TENANT_FILL_DETAIL,
  MISSING_TENANT_ID_DETAIL,
  SPEND_TENANT_MONEY_DETAIL,
  houseFillLook,
  isolateHouseVsTenant,
  requireTenantId,
  tenantIdPresent,
} from './house-vs-tenant.js';

describe('typed isolation pins', () => {
  it('house may not spend tenant money and may not look like a tenant fill', () => {
    expect(HOUSE_MAY_SPEND_TENANT_MONEY).toBe(false);
    expect(HOUSE_FILL_MAY_LOOK_LIKE_TENANT).toBe(false);
  });
});

describe('missing tenant id refuses', () => {
  it('treats undefined, null, empty, and whitespace as missing', () => {
    expect(tenantIdPresent(undefined)).toBe(false);
    expect(tenantIdPresent(null)).toBe(false);
    expect(tenantIdPresent('')).toBe(false);
    expect(tenantIdPresent('   ')).toBe(false);
    expect(tenantIdPresent('house-1')).toBe(true);
  });

  it('requireTenantId never defaults', () => {
    expect(requireTenantId(undefined)).toEqual({
      ok: false,
      reason: 'missing_tenant_id',
      detail: MISSING_TENANT_ID_DETAIL,
    });
    expect(requireTenantId(' desk-a ')).toEqual({ ok: true, tenantId: 'desk-a' });
  });
});

describe('isolateHouseVsTenant', () => {
  it('missing tenant id wins over spend and fill-look', () => {
    expect(isolateHouseVsTenant({ tenantId: '', spendBook: 'tenant', fillLooksLike: 'tenant' })).toMatchObject({
      ok: false,
      reason: 'missing_tenant_id',
    });
  });

  it('refuses house spend of tenant money', () => {
    const result = isolateHouseVsTenant({
      tenantId: 'house-1',
      spendBook: 'tenant',
      fillLooksLike: 'house',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'spend_tenant_money',
      detail: SPEND_TENANT_MONEY_DETAIL,
    });
  });

  it('refuses a house fill that looks like a tenant fill', () => {
    const result = isolateHouseVsTenant({
      tenantId: 'house-1',
      spendBook: 'house',
      fillLooksLike: 'tenant',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'looks_like_tenant_fill',
      detail: LOOKS_LIKE_TENANT_FILL_DETAIL,
    });
  });

  it('spend_tenant_money wins over looks_like_tenant_fill when both apply', () => {
    expect(isolateHouseVsTenant({ tenantId: 'house-1', spendBook: 'tenant', fillLooksLike: 'tenant' })).toMatchObject({
      ok: false,
      reason: 'spend_tenant_money',
    });
  });

  it('clears house spend + house fill look with a present tenant id', () => {
    expect(isolateHouseVsTenant({ tenantId: ' house-1 ', spendBook: 'house', fillLooksLike: 'house' })).toEqual({
      ok: true,
      tenantId: 'house-1',
      spendBook: 'house',
      fillLooksLike: 'house',
    });
  });
});

describe('houseFillLook', () => {
  it('labels house fills as house, never tenant', () => {
    const look = houseFillLook('house-1');
    expect(look).toEqual({ book: 'house', tenantId: 'house-1' });
    if ('book' in look) expect(look.book).not.toBe('tenant');
  });

  it('refuses missing tenant id instead of a tenant-shaped fill', () => {
    expect(houseFillLook(undefined)).toMatchObject({ ok: false, reason: 'missing_tenant_id' });
  });
});
