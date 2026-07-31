import { describe, expect, it } from 'vitest';
import { parseAmount as amt, formatAmount } from '@intafaced/ledger-client';
import { planClose, summarizeClose } from './close-planner.js';

const USER = '11111111-1111-4111-8111-111111111111';

function base() {
  return {
    positionId: 'pos-1',
    userId: USER,
    side: 'long' as const,
    size: amt('1'),
    entryPrice: amt('100'),
    margin: amt('20'),
    marginAsset: 'USDT',
  };
}

describe('planClose', () => {
  it('refuses invalid exit (never invents)', () => {
    expect(planClose({ closeId: 'c1', position: base(), exitPrice: '0' }).close).toBe(false);
    expect(planClose({ closeId: 'c1', position: base(), exitPrice: '-1' }).close).toBe(false);
  });

  it('profit close: realize profit + full margin release', () => {
    // long entry 100 exit 110 → pnl +10
    const plan = planClose({ closeId: 'c-win', position: base(), exitPrice: '110' });
    expect(plan.close).toBe(true);
    if (!plan.close) return;
    expect(plan.reason).toBe('profit');
    expect(formatAmount(plan.realizedPnl)).toBe('10');
    expect(formatAmount(plan.profit)).toBe('10');
    expect(formatAmount(plan.residualRelease)).toBe('20');
    expect(plan.recipes).toHaveLength(2);
    expect(plan.recipes[0]!.reason).toBe('futures.profit.realized');
    expect(plan.recipes[1]!.reason).toBe('futures.margin.release');
    expect(summarizeClose(plan)).toContain('profit');
  });

  it('loss within margin: realize loss + residual release', () => {
    // long entry 100 exit 90 → pnl -10, margin 20 → residual 10
    const plan = planClose({ closeId: 'c-loss', position: base(), exitPrice: '90' });
    expect(plan.close).toBe(true);
    if (!plan.close) return;
    expect(plan.reason).toBe('loss');
    expect(formatAmount(plan.loss)).toBe('10');
    expect(formatAmount(plan.fromMargin)).toBe('10');
    expect(formatAmount(plan.fromInsurance)).toBe('0');
    expect(formatAmount(plan.residualRelease)).toBe('10');
    expect(plan.recipes.map((r) => r.reason)).toEqual(['futures.loss.realized', 'futures.margin.release']);
  });

  it('loss exceeds margin: insurance shortfall + no residual', () => {
    // long entry 100 exit 70 → pnl -30, margin 20 → insurance 10
    const plan = planClose({ closeId: 'c-wipe', position: base(), exitPrice: '70' });
    expect(plan.close).toBe(true);
    if (!plan.close) return;
    expect(formatAmount(plan.fromMargin)).toBe('20');
    expect(formatAmount(plan.fromInsurance)).toBe('10');
    expect(formatAmount(plan.residualRelease)).toBe('0');
    expect(plan.recipes).toHaveLength(1);
    expect(plan.recipes[0]!.reason).toBe('futures.loss.realized');
  });

  it('flat close: margin release only', () => {
    const plan = planClose({ closeId: 'c-flat', position: base(), exitPrice: '100' });
    expect(plan.close).toBe(true);
    if (!plan.close) return;
    expect(plan.reason).toBe('flat');
    expect(formatAmount(plan.realizedPnl)).toBe('0');
    expect(plan.recipes).toHaveLength(1);
    expect(plan.recipes[0]!.reason).toBe('futures.margin.release');
  });

  it('short profit when price drops', () => {
    const pos = { ...base(), side: 'short' as const, entryPrice: amt('100'), margin: amt('15') };
    const plan = planClose({ closeId: 'c-short', position: pos, exitPrice: '90' });
    expect(plan.close).toBe(true);
    if (!plan.close) return;
    expect(plan.reason).toBe('profit');
    expect(formatAmount(plan.profit)).toBe('10');
  });
});
