import { describe, expect, it } from 'vitest';
import { MERCHANT_MONEY_WRITE_TOOLS } from './guardrail.js';
import {
  merchantMoneyDenyBoardCard,
  merchantMoneyDenyStatusLine,
  parseMerchantMoneyDenyStatusLine,
  merchantMoneyDenyStatusLineMatches,
  merchantGuardrailBoardCard,
  merchantGuardrailStatusLine,
  parseMerchantGuardrailStatusLine,
  merchantGuardrailStatusLineMatches,
  merchantGuardrailStatusLineConsistent,
  merchantGuardrailExportHeader,
  merchantGuardrailExportLine,
  merchantGuardrailExportText,
  isMerchantMoneyDenied,
  merchantWatchRefuseBoardCard,
  merchantWatchRefuseHonest,
} from './guardrail-honesty.js';
import { watchApprovalFixtures, type ApprovalRatePoint } from './watch.js';

describe('L3 wave118 merchant guardrail honesty', () => {
  it('money denylist and Stage-1 grant boards', () => {
    expect(MERCHANT_MONEY_WRITE_TOOLS).toContain('ledger.post');
    expect(isMerchantMoneyDenied('ledger.post')).toBe(true);
    expect(isMerchantMoneyDenied('pay.metrics.read')).toBe(false);
    expect(merchantMoneyDenyBoardCard().hasLedgerPost).toBe(1);
    expect(merchantMoneyDenyStatusLineMatches()).toBe(true);
    expect(parseMerchantMoneyDenyStatusLine(merchantMoneyDenyStatusLine())?.tools).toBe(MERCHANT_MONEY_WRITE_TOOLS.length);

    const card = merchantGuardrailBoardCard();
    expect(card.agentId).toBe('merchant');
    expect(card.writeTools).toBe(0);
    expect(card.readTools).toBeGreaterThan(0);
    expect(merchantGuardrailStatusLineMatches()).toBe(true);
    expect(merchantGuardrailStatusLineConsistent(merchantGuardrailStatusLine())).toBe(true);
    expect(merchantGuardrailExportText().startsWith(merchantGuardrailExportHeader())).toBe(true);
    expect(merchantGuardrailExportLine().startsWith('merchant,')).toBe(true);
    expect(parseMerchantGuardrailStatusLine('nope')).toBeNull();
  });

  it('D26-P1-A4: watch refuse catalog is named — missing data is not a numeric rate', () => {
    const card = merchantWatchRefuseBoardCard();
    expect(card.codes).toBe(3);
    expect(card.hasNoMetrics).toBe(1);
    expect(card.hasPayPlaneDark).toBe(1);
    expect(card.hasStale).toBe(1);

    const now = new Date('2026-08-05T12:00:00.000Z');
    const hole: ApprovalRatePoint = {
      railId: 'x',
      approvalRate: null,
      attempts: null,
      asOf: '2026-08-05T11:59:00.000Z',
      maxAgeMs: 120_000,
    };
    const missing = watchApprovalFixtures([hole], { now, payPlane: 'live' });
    expect(merchantWatchRefuseHonest(missing, 'no_metrics')).toBe(true);
    const dark = watchApprovalFixtures([hole], { now, payPlane: 'dark' });
    expect(merchantWatchRefuseHonest(dark, 'pay_plane_dark')).toBe(true);
    expect(merchantWatchRefuseHonest({ status: 'unavailable', reason: 'no_metrics', approvalRate: 0.85 }, 'no_metrics')).toBe(false);
  });
});
