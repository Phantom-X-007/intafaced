import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { BankPayoutAbsentAdapter } from './bank-payout.js';
import { assertRailMayMoveValue, SandboxRailRefusal } from './posture.js';
import { RailRegistry } from './registry.js';

describe('BankPayoutAbsentAdapter', () => {
  const rail = () => new BankPayoutAbsentAdapter();

  it('is absent, not sandbox — so boot does not treat it as a simulated counterparty', () => {
    const a = rail();
    expect(a.mode).toBe('absent');
    expect(a.id).toBe('bank-payout');
    expect(a.capabilities).toEqual(['payout']);
    expect(a.health().healthy).toBe(false);
  });

  it('refuses every interface call — nothing fabricates a bank reference', async () => {
    const a = rail();
    const payout = await a.payout({
      settlementId: 's1',
      merchantId: 'm1',
      amount: parseAmount('10'),
      assetId: 'USD',
      window: 'w1',
      destination: { kind: 'bank', ref: 'GB00X' },
    });
    expect(payout.ok).toBe(false);
    expect(payout.failureCode).toBe('bank.not_configured');

    const auth = await a.authorize({
      paymentId: 'p1',
      merchantId: 'm1',
      amount: parseAmount('1'),
      assetId: 'USD',
      method: 'bank',
    });
    expect(auth.ok).toBe(false);
  });

  it('assertRailMayMoveValue refuses before any ledger hold (live-only and allow-sandbox)', () => {
    const a = rail();
    expect(() => assertRailMayMoveValue(a, 'payout', 'live-only')).toThrow(SandboxRailRefusal);
    expect(() => assertRailMayMoveValue(a, 'payout', 'allow-sandbox')).toThrow(SandboxRailRefusal);
    try {
      assertRailMayMoveValue(a, 'payout', 'live-only');
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.rail_not_live', reason: 'absent', railId: 'bank-payout' });
    }
  });

  it('registers in a registry and is selectable by id for an honest refuse', () => {
    const registry = new RailRegistry([rail()]);
    const got = registry.require('bank-payout', 'payout');
    expect(got.mode).toBe('absent');
    expect(() => assertRailMayMoveValue(got, 'payout', 'live-only')).toThrow(/NOTHING CONFIGURED/);
  });
});
