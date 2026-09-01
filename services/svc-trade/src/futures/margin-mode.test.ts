/**
 * PTX-M08-R10/R11 — named 2×2 modes and yield collateral refuse closed.
 * Does not invent haircuts or IM numbers.
 */
import { describe, expect, it } from 'vitest';
import {
  CASH_MARGIN_UNSUPPORTED,
  CROSS_MARGIN_UNSUPPORTED,
  COLLATERAL_CLASSES,
  MARGIN_CALCULATION,
  MARGIN_MODE_INELIGIBLE,
  MARGIN_MODE_SWITCH_REQUIRES_PREVIEW,
  MARGIN_MODE_UNKNOWN,
  MARGIN_MODE_UNSET,
  MARGIN_PRODUCTS_2X2,
  MARGIN_SEGREGATION,
  NAMED_MARGIN_MODES,
  PORTFOLIO_MARGIN_UNSET,
  UNSUPPORTED_COLLATERAL_CLASS,
  checkCollateralClassForMargin,
  checkMarginModeForFuturesOpen,
  checkMarginModeSwitch,
  ownerPortfolioScenarioSet,
  parseNamedMarginMode,
} from './margin-mode.js';

describe('named 2×2 margin products (PTX-M08-R10)', () => {
  it('names cash, isolated, cross, and portfolio', () => {
    expect([...NAMED_MARGIN_MODES]).toEqual(['cash', 'isolated', 'cross', 'portfolio']);
  });

  it('names all four segregation × calculation combinations', () => {
    expect([...MARGIN_SEGREGATION]).toEqual(['segregated', 'cross_collateral']);
    expect([...MARGIN_CALCULATION]).toEqual(['standard', 'portfolio']);
    expect(MARGIN_PRODUCTS_2X2).toHaveLength(4);
    const cells = MARGIN_PRODUCTS_2X2.map((p) => `${p.segregation}×${p.calculation}`).sort();
    expect(cells).toEqual(['cross_collateral×portfolio', 'cross_collateral×standard', 'segregated×portfolio', 'segregated×standard']);
    expect(MARGIN_PRODUCTS_2X2.find((p) => p.segregation === 'segregated' && p.calculation === 'standard')?.namedMode).toBe('isolated');
    expect(MARGIN_PRODUCTS_2X2.find((p) => p.segregation === 'cross_collateral' && p.calculation === 'standard')?.namedMode).toBe('cross');
    expect(MARGIN_PRODUCTS_2X2.filter((p) => p.calculation === 'portfolio').map((p) => p.namedMode)).toEqual(['portfolio', 'portfolio']);
  });
});

describe('parseNamedMarginMode', () => {
  it('refuses unset', () => {
    expect(parseNamedMarginMode(undefined).ok).toBe(false);
    expect(parseNamedMarginMode(undefined)).toMatchObject({ code: MARGIN_MODE_UNSET });
    expect(parseNamedMarginMode(null)).toMatchObject({ code: MARGIN_MODE_UNSET });
    expect(parseNamedMarginMode('')).toMatchObject({ code: MARGIN_MODE_UNSET });
    expect(parseNamedMarginMode('   ')).toMatchObject({ code: MARGIN_MODE_UNSET });
  });

  it('refuses unknown', () => {
    expect(parseNamedMarginMode('CROSS')).toMatchObject({ ok: false, code: MARGIN_MODE_UNKNOWN });
    expect(parseNamedMarginMode('multi')).toMatchObject({ ok: false, code: MARGIN_MODE_UNKNOWN });
    expect(parseNamedMarginMode(1)).toMatchObject({ ok: false, code: MARGIN_MODE_UNSET });
  });

  it('admits each named mode', () => {
    for (const mode of NAMED_MARGIN_MODES) {
      expect(parseNamedMarginMode(mode)).toEqual({ ok: true, mode });
    }
  });
});

describe('checkMarginModeForFuturesOpen', () => {
  it('admits isolated and omit (isolated-at-open door)', () => {
    expect(checkMarginModeForFuturesOpen(undefined)).toEqual({ ok: true });
    expect(checkMarginModeForFuturesOpen('isolated')).toEqual({ ok: true });
  });

  it('refuses unknown rather than coercing to isolated', () => {
    expect(checkMarginModeForFuturesOpen('CROSS')).toMatchObject({ ok: false, code: MARGIN_MODE_UNKNOWN });
    expect(checkMarginModeForFuturesOpen(null)).toMatchObject({ ok: false, code: MARGIN_MODE_UNSET });
  });

  it('refuses named cash — not futures IM', () => {
    expect(checkMarginModeForFuturesOpen('cash')).toMatchObject({ ok: false, code: CASH_MARGIN_UNSUPPORTED });
  });

  it('refuses named cross — no path, even disabled', () => {
    const check = checkMarginModeForFuturesOpen('cross');
    expect(check).toMatchObject({ ok: false, code: CROSS_MARGIN_UNSUPPORTED });
    if (!check.ok) expect(check.reason).toContain('misreport what is backing it');
  });

  it('refuses portfolio because the owner scenario set is unset (OWNER-SET)', () => {
    expect(ownerPortfolioScenarioSet()).toBe(false);
    expect(ownerPortfolioScenarioSet({ TRADE_FUTURES_PORTFOLIO_SCENARIO: '{"shocks":[]}' })).toBe(false);
    const check = checkMarginModeForFuturesOpen('portfolio');
    expect(check).toMatchObject({ ok: false, code: PORTFOLIO_MARGIN_UNSET });
    if (!check.ok) expect(check.reason).toMatch(/OWNER-SET/);
  });
});

describe('checkCollateralClassForMargin (PTX-M08-R11)', () => {
  it('names the collateral classes and admits cash', () => {
    expect([...COLLATERAL_CLASSES]).toEqual(['cash', 'yield_bearing', 'staked', 'lending_idle']);
    expect(checkCollateralClassForMargin(undefined)).toEqual({ ok: true });
    expect(checkCollateralClassForMargin('cash')).toEqual({ ok: true });
  });

  it('refuses yield-bearing as IM', () => {
    expect(checkCollateralClassForMargin('yield_bearing')).toMatchObject({
      ok: false,
      code: UNSUPPORTED_COLLATERAL_CLASS,
    });
  });

  it('refuses staked as IM', () => {
    expect(checkCollateralClassForMargin('staked')).toMatchObject({ ok: false, code: UNSUPPORTED_COLLATERAL_CLASS });
  });

  it('refuses lending-idle as IM', () => {
    expect(checkCollateralClassForMargin('lending_idle')).toMatchObject({
      ok: false,
      code: UNSUPPORTED_COLLATERAL_CLASS,
    });
  });

  it('refuses an unknown class rather than posting it', () => {
    expect(checkCollateralClassForMargin('lst')).toMatchObject({ ok: false, code: UNSUPPORTED_COLLATERAL_CLASS });
  });
});

describe('checkMarginModeSwitch (PTX-M08-R02/R10)', () => {
  it('refuses switching with open risk and no migration preview', () => {
    const check = checkMarginModeSwitch({
      from: 'isolated',
      to: 'cross',
      hasOpenRisk: true,
      eligible: true,
      migrationPreviewId: null,
    });
    expect(check).toMatchObject({ ok: false, code: MARGIN_MODE_SWITCH_REQUIRES_PREVIEW });
  });

  it('refuses a switch without eligibility even with a preview', () => {
    expect(
      checkMarginModeSwitch({
        from: 'isolated',
        to: 'portfolio',
        hasOpenRisk: false,
        eligible: false,
        migrationPreviewId: 'preview-1',
      }),
    ).toMatchObject({ ok: false, code: MARGIN_MODE_INELIGIBLE });
  });

  it('refuses unknown destination', () => {
    expect(checkMarginModeSwitch({ from: 'isolated', to: 'multi', hasOpenRisk: false, eligible: true })).toMatchObject({
      ok: false,
      code: MARGIN_MODE_UNKNOWN,
    });
  });

  it('same-mode isolated is a no-op; same-mode portfolio still OWNER-SET refuses', () => {
    expect(checkMarginModeSwitch({ from: 'isolated', to: 'isolated', hasOpenRisk: true })).toEqual({ ok: true });
    expect(checkMarginModeSwitch({ from: 'portfolio', to: 'portfolio', hasOpenRisk: false, eligible: true })).toMatchObject({
      ok: false,
      code: PORTFOLIO_MARGIN_UNSET,
    });
  });

  it('eligible + preview still refuses cross/portfolio — no invented IM', () => {
    expect(
      checkMarginModeSwitch({
        from: 'isolated',
        to: 'cross',
        hasOpenRisk: true,
        eligible: true,
        migrationPreviewId: 'preview-1',
      }),
    ).toMatchObject({ ok: false, code: CROSS_MARGIN_UNSUPPORTED });
    expect(
      checkMarginModeSwitch({
        from: 'isolated',
        to: 'portfolio',
        hasOpenRisk: true,
        eligible: true,
        migrationPreviewId: 'preview-1',
      }),
    ).toMatchObject({ ok: false, code: PORTFOLIO_MARGIN_UNSET });
  });
});
