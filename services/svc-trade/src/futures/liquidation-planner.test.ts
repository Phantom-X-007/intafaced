import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { planLiquidation, summarizeLiquidation, unrealizedPnl } from './liquidation-planner.js';

const USER = '11111111-1111-4111-8111-111111111111';

const base = {
  positionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: USER,
  side: 'long' as const,
  size: amt('1'),
  entryPrice: amt('50000'),
  margin: amt('5000'),
  marginAsset: 'USDT',
};

describe('liquidation-planner', () => {
  it('uPnL long: mark down is negative', () => {
    expect(formatAmount(unrealizedPnl('long', amt('1'), amt('50000'), amt('49000')))).toBe('-1000');
  });

  it('healthy long above maintenance → skip', () => {
    const d = planLiquidation({
      liquidationId: 'liq-1',
      position: base,
      markPrice: '50000',
    });
    expect(d.liquidate).toBe(false);
    if (!d.liquidate) expect(d.reason).toBe('healthy');
  });

  it('long wiped by mark drop → full margin loss', () => {
    // entry 50k, mark 40k → uPnL -10k > margin 5k → insurance 5k
    const d = planLiquidation({
      liquidationId: 'liq-2',
      position: base,
      markPrice: '40000',
    });
    expect(d.liquidate).toBe(true);
    if (d.liquidate) {
      expect(formatAmount(d.loss)).toBe('10000');
      expect(formatAmount(d.fromMargin)).toBe('5000');
      expect(formatAmount(d.fromInsurance)).toBe('5000');
      expect(formatAmount(d.residualRelease)).toBe('0');
      expect(d.recipes.some((r) => r.reason === 'futures.loss.realized')).toBe(true);
      expect(summarizeLiquidation(d)).toContain('liquidate');
    }
  });

  it('long mild drawdown below 50% maintenance → liquidate with residual release', () => {
    // uPnL -3000, equity 2000, maintenance 2500 → liquidate
    // loss 3000, fromMargin 3000, residual 2000 release
    const d = planLiquidation({
      liquidationId: 'liq-3',
      position: base,
      markPrice: '47000',
      maintenanceBps: 5000,
    });
    expect(d.liquidate).toBe(true);
    if (d.liquidate) {
      expect(formatAmount(d.loss)).toBe('3000');
      expect(formatAmount(d.fromMargin)).toBe('3000');
      expect(formatAmount(d.fromInsurance)).toBe('0');
      expect(formatAmount(d.residualRelease)).toBe('2000');
      expect(d.recipes).toHaveLength(2);
    }
  });

  it('liqPrice cross forces liquidate even if equity healthy under high maintenanceBps=0', () => {
    const d = planLiquidation({
      liquidationId: 'liq-4',
      position: { ...base, liqPrice: amt('48000'), margin: amt('20000') },
      markPrice: '47000',
      maintenanceBps: 0,
    });
    // equity = 20000 - 3000 = 17000 > 0, maint 0 → would be healthy without liqPrice
    expect(d.liquidate).toBe(true);
    if (d.liquidate) expect(d.reason).toBe('mark_crossed_liq_price');
  });

  it('short liquidates when mark rises past equity wipe', () => {
    const d = planLiquidation({
      liquidationId: 'liq-5',
      position: {
        ...base,
        side: 'short',
        margin: amt('5000'),
      },
      markPrice: '60000', // loss 10k
    });
    expect(d.liquidate).toBe(true);
    if (d.liquidate) {
      expect(formatAmount(d.fromMargin)).toBe('5000');
      expect(formatAmount(d.fromInsurance)).toBe('5000');
    }
  });
});
