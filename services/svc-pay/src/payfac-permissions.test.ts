import { describe, expect, it } from 'vitest';
import {
  MONEY_PERMISSION_AREAS,
  PAYFAC_PERMISSION_SOCKETS,
  PAYFAC_SURFACE_AREAS,
  areaForSurface,
  isPayfacPermissionPort,
  permissionAreaCoverage,
  resolveActorMerchantId,
} from './payfac-permissions.js';
import { DEFAULT_GRANTED_AREAS, PERMISSION_AREAS, SubMerchantError } from './submerchants.js';

describe('D26-P1-P2 payfac permissions map', () => {
  it('names every vocabulary area exactly once in PERMISSION_AREAS', () => {
    expect(new Set(PERMISSION_AREAS).size).toBe(PERMISSION_AREAS.length);
    expect(PERMISSION_AREAS.length).toBe(11);
  });

  it('never default-grants a money area — onboarding stays visibility-only', () => {
    for (const area of MONEY_PERMISSION_AREAS) {
      expect(DEFAULT_GRANTED_AREAS).not.toContain(area);
    }
    expect(DEFAULT_GRANTED_AREAS).toEqual(['merchant.profile', 'submerchant']);
  });

  it('every REST surface maps to a known PermissionArea', () => {
    for (const [surface, area] of Object.entries(PAYFAC_SURFACE_AREAS)) {
      expect(PERMISSION_AREAS, surface).toContain(area);
      expect(areaForSurface(surface as keyof typeof PAYFAC_SURFACE_AREAS)).toBe(area);
    }
  });

  it('refund surface is not the same area as capture — value-out is its own grant', () => {
    expect(PAYFAC_SURFACE_AREAS['rest.payments.capture']).toBe('payment');
    expect(PAYFAC_SURFACE_AREAS['rest.payments.refund']).toBe('payment.refund');
  });

  it('honest §13 sockets are named (settling partner + fee splits) — not inventable here', () => {
    expect(PAYFAC_PERMISSION_SOCKETS.map((s) => s.id)).toEqual(['socket.payfac-settling-party-partner', 'socket.payfac-split-fee-recipes']);
    for (const s of PAYFAC_PERMISSION_SOCKETS) {
      expect(s.residual.length).toBeGreaterThan(40);
    }
  });

  it('coverage helper exposes areas + money + defaults + sockets together', () => {
    const c = permissionAreaCoverage();
    expect(c.areas).toBe(PERMISSION_AREAS);
    expect(c.money).toEqual([...MONEY_PERMISSION_AREAS]);
    expect(c.defaults).toBe(DEFAULT_GRANTED_AREAS);
    expect(c.sockets).toBe(PAYFAC_PERMISSION_SOCKETS);
  });

  it('isPayfacPermissionPort requires grant/revoke/list/history — assertHolds alone is not enough', () => {
    expect(isPayfacPermissionPort(null)).toBe(false);
    expect(isPayfacPermissionPort({ assertHolds: async () => undefined })).toBe(false);
    expect(
      isPayfacPermissionPort({
        assertHolds: async () => undefined,
        grantPermission: async () => ({}) as never,
        revokePermission: async () => ({}) as never,
        listPermissions: async () => [],
        permissionHistory: async () => [],
      }),
    ).toBe(true);
  });
});

describe('resolveActorMerchantId — principal only', () => {
  it('refuses when the principal has no merchant node', async () => {
    await expect(resolveActorMerchantId({ getMerchantByUserId: async () => null }, 'user-1')).rejects.toMatchObject({
      code: 'pay.submerchant_not_onboarded',
    });
  });

  it('refuses a missing principal', async () => {
    await expect(resolveActorMerchantId({ getMerchantByUserId: async () => ({ id: 'm' }) }, undefined)).rejects.toBeInstanceOf(
      SubMerchantError,
    );
  });

  it('returns the merchant id from the lookup — never from a body field', async () => {
    await expect(resolveActorMerchantId({ getMerchantByUserId: async () => ({ id: 'merchant-root' }) }, 'user-root')).resolves.toBe(
      'merchant-root',
    );
  });
});
