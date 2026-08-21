import { describe, expect, it } from 'vitest';
import { assertTradeOnly, withdrawalPermissionHits, WithdrawalPermissionRefusedError } from './permissions.js';

describe('S-L6 venue key permissions — refuse at registration', () => {
  it('allows trade-only scopes', () => {
    expect(() => assertTradeOnly({ scopes: ['spot', 'trade', 'read', 'order'] })).not.toThrow();
    expect(withdrawalPermissionHits({ scopes: ['futures'], flags: { enableSpot: true } })).toEqual([]);
  });

  it('refuses withdraw scopes and enableWithdraw flags', () => {
    expect(withdrawalPermissionHits({ scopes: ['trade', 'withdraw'] })).toEqual(['scope:withdraw']);
    expect(withdrawalPermissionHits({ scopes: ['spot'], flags: { enableWithdraw: true } })).toEqual(['flag:enableWithdraw']);
    expect(withdrawalPermissionHits({ scopes: ['universalTransfer'] })[0]).toMatch(/universalTransfer/i);
    expect(() => assertTradeOnly({ scopes: ['withdraw'] })).toThrow(WithdrawalPermissionRefusedError);
  });

  it('refuses internal-transfer fund-out flags', () => {
    expect(() => assertTradeOnly({ scopes: ['spot'], flags: { enableInternalTransfer: true } })).toThrow(WithdrawalPermissionRefusedError);
  });
});
