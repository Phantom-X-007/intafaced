import { describe, expect, it, vi } from 'vitest';
import {
  ACADEMY_AMBASSADOR_SHARE_BPS_ENV,
  decideAmbassadorPay,
  findNamedAmbassadorPayExport,
  payout,
  proposePay,
  readOwnerShareBps,
  type LedgerPostPort,
} from './pay.js';

const ambassador = { kind: 'fee_share' as const, ambassadorUserId: 'amb-1' };

function spyLedger(): LedgerPostPort & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    post: vi.fn((body: unknown) => {
      calls.push(body);
      return { ok: true };
    }),
  };
}

describe('readOwnerShareBps', () => {
  it('unset env is not present (does not invent 0 as free)', () => {
    expect(readOwnerShareBps({})).toEqual({ present: false });
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: undefined })).toEqual({ present: false });
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '' })).toEqual({ present: false });
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '   ' })).toEqual({ present: false });
  });

  it('does not treat missing as 0', () => {
    const owner = readOwnerShareBps({});
    expect(owner.present).toBe(false);
    if (owner.present) expect.fail('missing env must not be present:true with bps 0');
  });

  it('rejects non-integers rather than inventing a rate', () => {
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '12.5' })).toEqual({ present: false });
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '-1' })).toEqual({ present: false });
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: 'free' })).toEqual({ present: false });
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '10000' })).toEqual({ present: false });
  });

  it('explicit 0 is owner-present, not a silent free skip', () => {
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '0' })).toEqual({ present: true, bps: 0 });
  });

  it('accepts a positive owner integer without inventing another value', () => {
    expect(readOwnerShareBps({ [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '250' })).toEqual({ present: true, bps: 250 });
  });
});

describe('proposePay / payout — unset refuse', () => {
  it('unset env → academy.ambassador_rate_unset', () => {
    const ledger = spyLedger();
    const proposed = proposePay(ambassador, { env: {}, ledger });
    expect(proposed).toMatchObject({
      ok: false,
      code: 'academy.ambassador_rate_unset',
      ledgerPosted: false,
      ownerShareBps: null,
      settlement: 'refused',
    });
    expect(ledger.calls).toEqual([]);
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('payout does not post when unset', async () => {
    const ledger = spyLedger();
    const result = await payout({ kind: 'ifc_pay', ambassadorUserId: 'amb-1' }, { env: {}, ledger });
    expect(result.code).toBe('academy.ambassador_rate_unset');
    expect(result.ledgerPosted).toBe(false);
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('blank env is unset, not 0-as-free success', () => {
    const ledger = spyLedger();
    const result = proposePay(ambassador, { env: { [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '' }, ledger });
    expect(result.code).toBe('academy.ambassador_rate_unset');
    expect(result.ok).toBe(false);
    expect(result.ownerShareBps).toBeNull();
    expect(ledger.post).not.toHaveBeenCalled();
  });
});

describe('rate set + no ambassador-named export', () => {
  it('settlement stays unwired — academy.ambassador_recipe_unwired', async () => {
    const ledger = spyLedger();
    const env = { [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '150' };
    const proposed = proposePay(ambassador, { env, ledger, ledgerExportCatalog: ['feeCharge', 'rewardPay'] });
    expect(proposed).toMatchObject({
      ok: false,
      code: 'academy.ambassador_recipe_unwired',
      ownerShareBps: 150,
      settlement: 'unwired',
      ledgerPosted: false,
    });
    const live = await payout({ kind: 'ifc_pay', ambassadorUserId: 'amb-1' }, { env, ledger, ledgerExportCatalog: [] });
    expect(live.code).toBe('academy.ambassador_recipe_unwired');
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('explicit 0 bps is not a free skip that posts nothing as success', () => {
    const ledger = spyLedger();
    const result = proposePay(ambassador, {
      env: { [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '0' },
      ledger,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('academy.ambassador_recipe_unwired');
    expect(result.ownerShareBps).toBe(0);
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('does not treat feeCharge/rewardPay as ambassador pay', () => {
    expect(findNamedAmbassadorPayExport(['feeCharge', 'rewardPay', 'tradeFill'])).toBeUndefined();
  });
});

describe('P&L profit-share is banned', () => {
  it('refuses pnl_profit_share even when bps are set', () => {
    const ledger = spyLedger();
    const result = proposePay(
      { kind: 'pnl_profit_share', ambassadorUserId: 'amb-1' },
      { env: { [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '200' }, ledger },
    );
    expect(result.code).toBe('academy.ambassador_pnl_share_banned');
    expect(result.ledgerPosted).toBe(false);
    expect(ledger.post).not.toHaveBeenCalled();
  });
});

describe('decideAmbassadorPay never invents amounts', () => {
  it('refuse objects have no amount / prize fields', () => {
    const unset = decideAmbassadorPay(ambassador, { env: {} });
    expect(unset).not.toHaveProperty('amount');
    expect(unset).not.toHaveProperty('ifcAmount');
    expect(unset).not.toHaveProperty('prize');
    const set = decideAmbassadorPay(ambassador, { env: { [ACADEMY_AMBASSADOR_SHARE_BPS_ENV]: '10' } });
    expect(set).not.toHaveProperty('amount');
  });
});
