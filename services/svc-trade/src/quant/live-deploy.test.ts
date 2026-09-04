/**
 * CARD R-quant — live deploy mill (unpinned refuse; paper cannot ledger).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  QUANT_LIVE_DEPLOY_IEEE,
  QUANT_LIVE_DEPLOY_PIN_ENV,
  QUANT_LIVE_DEPLOY_UNPINNED,
  QUANT_PAPER_CANNOT_LEDGER,
  checkQuantLiveDeploy,
  quantLiveDeployPinComposeWired,
  tradeComposeBlock,
} from './live-deploy.js';

const previous = process.env[QUANT_LIVE_DEPLOY_PIN_ENV];

function restoreEnv(): void {
  if (previous === undefined) delete process.env[QUANT_LIVE_DEPLOY_PIN_ENV];
  else process.env[QUANT_LIVE_DEPLOY_PIN_ENV] = previous;
}

describe('R-quant live deploy mill — pin and paper', () => {
  afterEach(restoreEnv);

  it('blank pin refuses live deploy by name — launched false', () => {
    delete process.env[QUANT_LIVE_DEPLOY_PIN_ENV];
    expect(checkQuantLiveDeploy({})).toMatchObject({
      ok: false,
      code: QUANT_LIVE_DEPLOY_UNPINNED,
      executed: false,
      launched: false,
      posted: false,
      orders: [],
    });
    expect(checkQuantLiveDeploy({ pin: '  ' })).toMatchObject({
      ok: false,
      code: QUANT_LIVE_DEPLOY_UNPINNED,
    });
    expect(checkQuantLiveDeploy({ environment: 'live' })).toMatchObject({
      ok: false,
      code: QUANT_LIVE_DEPLOY_UNPINNED,
    });
  });

  it('paper / backtest / shadow refuse ledger and live launch even with a pin', () => {
    process.env[QUANT_LIVE_DEPLOY_PIN_ENV] = 'owner-eligibility-pin';
    for (const environment of ['paper', 'backtest', 'shadow', 'PAPER'] as const) {
      expect(checkQuantLiveDeploy({ environment, pin: 'owner-eligibility-pin' })).toMatchObject({
        ok: false,
        code: QUANT_PAPER_CANNOT_LEDGER,
        executed: false,
        launched: false,
        posted: false,
        orders: [],
      });
    }
  });

  it('IEEE number pin refuses — never a JS eligibility magnitude', () => {
    delete process.env[QUANT_LIVE_DEPLOY_PIN_ENV];
    expect(checkQuantLiveDeploy({ pin: 1 })).toMatchObject({
      ok: false,
      code: QUANT_LIVE_DEPLOY_IEEE,
      executed: false,
      launched: false,
    });
  });

  it('pin present still does not launch — preview only', () => {
    delete process.env[QUANT_LIVE_DEPLOY_PIN_ENV];
    const result = checkQuantLiveDeploy({ pin: 'owner-eligibility-pin' });
    expect(result).toEqual({
      ok: true,
      preview: true,
      executed: false,
      launched: false,
      posted: false,
      orders: [],
      pinPresent: true,
    });
  });

  it('compose passes TRADE_QUANT_LIVE_DEPLOY_PIN empty — never invents a pin', () => {
    expect(quantLiveDeployPinComposeWired()).toBe(true);
    const block = tradeComposeBlock();
    expect(block).not.toMatch(/TRADE_QUANT_LIVE_DEPLOY_PIN:\s*['"]?[A-Za-z0-9]/);
  });
});
