import { describe, expect, it } from 'vitest';
import { NAVIGATOR_MONEY_WRITE_TOOLS } from './guardrail.js';
import {
  navigatorMoneyDenyBoardCard,
  navigatorMoneyDenyStatusLine,
  parseNavigatorMoneyDenyStatusLine,
  navigatorMoneyDenyStatusLineMatches,
  navigatorMoneyDenyStatusLineConsistent,
  navigatorMoneyDenyExportHeader,
  navigatorMoneyDenyExportLine,
  navigatorMoneyDenyExportText,
  isNavigatorMoneyDenied,
  NAVIGATOR_MONEY_DENY_BILLED_AMOUNT,
  isNavigatorMoneyShapedTool,
  navigatorMoneyShapedToolBillPin,
  navigatorMoneyDenyBilledAmountIsPinnedZero,
} from './money-deny-honesty.js';

describe('L3 wave123 navigator money denylist honesty', () => {
  it('denylist boards mirror guardrail.ts', () => {
    expect(NAVIGATOR_MONEY_WRITE_TOOLS).toContain('ledger.post');
    for (const t of NAVIGATOR_MONEY_WRITE_TOOLS) {
      expect(isNavigatorMoneyDenied(t)).toBe(true);
    }
    expect(isNavigatorMoneyDenied('trade.quote')).toBe(false);
    expect(navigatorMoneyDenyBoardCard()).toEqual({
      tools: NAVIGATOR_MONEY_WRITE_TOOLS.length,
      hasLedgerPost: 1,
      hasTradeOrder: 1,
      hasBankTransfer: 1,
    });
    expect(navigatorMoneyDenyStatusLineMatches()).toBe(true);
    expect(navigatorMoneyDenyStatusLineConsistent(navigatorMoneyDenyStatusLine())).toBe(true);
    expect(navigatorMoneyDenyExportText().startsWith(navigatorMoneyDenyExportHeader())).toBe(true);
    expect(navigatorMoneyDenyExportLine()).toBe(`${NAVIGATOR_MONEY_WRITE_TOOLS.length},1,1,1`);
    expect(parseNavigatorMoneyDenyStatusLine('nope')).toBeNull();
  });

  it('money-shaped tools cannot bill; a default fee/charge cannot sneak in', () => {
    expect(NAVIGATOR_MONEY_DENY_BILLED_AMOUNT).toBe('0');
    expect(typeof NAVIGATOR_MONEY_DENY_BILLED_AMOUNT).toBe('string');
    expect(navigatorMoneyDenyBilledAmountIsPinnedZero(NAVIGATOR_MONEY_DENY_BILLED_AMOUNT)).toBe(true);
    expect(navigatorMoneyDenyBilledAmountIsPinnedZero('1')).toBe(false);
    expect(navigatorMoneyDenyBilledAmountIsPinnedZero('0.01')).toBe(false);

    const sneak = { fee: '1', charge: '0.01', defaultFee: '9.99' } as const;
    for (const t of NAVIGATOR_MONEY_WRITE_TOOLS) {
      expect(isNavigatorMoneyShapedTool(t)).toBe(true);
      const pin = navigatorMoneyShapedToolBillPin(t, sneak);
      expect(pin, t).toEqual({
        denied: true,
        billedAmount: '0',
        inventedCharge: false,
        defaultFeeApplied: false,
      });
      if (pin.denied) {
        expect(typeof pin.billedAmount).toBe('string');
        expect(typeof pin.billedAmount).not.toBe('number');
        expect(navigatorMoneyDenyBilledAmountIsPinnedZero(pin.billedAmount)).toBe(true);
      }
    }

    expect(isNavigatorMoneyShapedTool('trade.quote')).toBe(false);
    expect(navigatorMoneyShapedToolBillPin('trade.quote', sneak)).toEqual({ denied: false });
    expect(isNavigatorMoneyShapedTool('pay.charge')).toBe(true);
    expect(navigatorMoneyShapedToolBillPin('pay.charge', sneak)).toEqual({
      denied: true,
      billedAmount: '0',
      inventedCharge: false,
      defaultFeeApplied: false,
    });
  });
});
