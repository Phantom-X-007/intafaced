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
} from './guardrail-honesty.js';

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
});
