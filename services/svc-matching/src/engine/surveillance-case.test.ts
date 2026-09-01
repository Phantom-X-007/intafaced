import { describe, expect, it } from 'vitest';
import {
  AUTO_CLOSE_FORBIDDEN,
  INVENTED_SANCTION,
  MISSING_ACCOUNT,
  MISSING_MARKET,
  MISSING_REASON,
  UNKNOWN_PATTERN,
  closeSurveillanceCase,
  fineSurveillanceCase,
  openSurveillanceCase,
  punishSurveillanceCase,
} from './surveillance-case.js';

/**
 * PTX-M16 first slice: a known abuse event is a named open case.
 * Not a regulator product. Unknown pattern refuses. No invented sanction.
 */

describe('surveillance case — named evidence, no invented sanction', () => {
  it('opens when accountId, marketId, and a known reason are present', () => {
    const opened = openSurveillanceCase({
      accountId: 'desk',
      marketId: 'BTC/USDT',
      reason: 'self_trade',
    });
    expect(opened).toEqual({
      ok: true,
      case: { accountId: 'desk', marketId: 'BTC/USDT', reason: 'self_trade', status: 'open' },
    });
  });

  it('names spoofing and layering as open cases — it does not adjudicate them', () => {
    expect(openSurveillanceCase({ accountId: 'desk', marketId: 'BTC/USDT', reason: 'spoofing' })).toEqual({
      ok: true,
      case: { accountId: 'desk', marketId: 'BTC/USDT', reason: 'spoofing', status: 'open' },
    });
    expect(openSurveillanceCase({ accountId: 'desk', marketId: 'BTC/USDT', reason: 'layering' })).toEqual({
      ok: true,
      case: { accountId: 'desk', marketId: 'BTC/USDT', reason: 'layering', status: 'open' },
    });
  });

  it('blank or missing accountId refuses', () => {
    expect(openSurveillanceCase({ accountId: '', marketId: 'BTC/USDT', reason: 'self_trade' }).ok).toBe(false);
    expect(openSurveillanceCase({ accountId: '   ', marketId: 'BTC/USDT', reason: 'self_trade' })).toMatchObject({
      ok: false,
      code: MISSING_ACCOUNT,
    });
    expect(openSurveillanceCase({ marketId: 'BTC/USDT', reason: 'self_trade' })).toMatchObject({
      ok: false,
      code: MISSING_ACCOUNT,
    });
  });

  it('blank or missing marketId refuses', () => {
    expect(openSurveillanceCase({ accountId: 'desk', marketId: '', reason: 'self_trade' })).toMatchObject({
      ok: false,
      code: MISSING_MARKET,
    });
    expect(openSurveillanceCase({ accountId: 'desk', reason: 'self_trade' })).toMatchObject({
      ok: false,
      code: MISSING_MARKET,
    });
  });

  it('blank reason refuses — it does not invent a pattern', () => {
    expect(openSurveillanceCase({ accountId: 'desk', marketId: 'BTC/USDT', reason: '' })).toMatchObject({
      ok: false,
      code: MISSING_REASON,
    });
    expect(openSurveillanceCase({ accountId: 'desk', marketId: 'BTC/USDT', reason: '   ' })).toMatchObject({
      ok: false,
      code: MISSING_REASON,
    });
    expect(openSurveillanceCase({ accountId: 'desk', marketId: 'BTC/USDT' })).toMatchObject({
      ok: false,
      code: MISSING_REASON,
    });
  });

  it('unknown pattern refuses rather than auto-adjudicate', () => {
    const refused = openSurveillanceCase({
      accountId: 'desk',
      marketId: 'BTC/USDT',
      reason: 'quote_stuffing',
    });
    expect(refused).toMatchObject({ ok: false, code: UNKNOWN_PATTERN });
    expect('case' in refused).toBe(false);
  });

  it('auto-close, fine, and punish refuse — a case is not a money movement', () => {
    expect(closeSurveillanceCase()).toMatchObject({ ok: false, code: AUTO_CLOSE_FORBIDDEN });
    expect(fineSurveillanceCase()).toMatchObject({ ok: false, code: INVENTED_SANCTION });
    expect(punishSurveillanceCase()).toMatchObject({ ok: false, code: INVENTED_SANCTION });
    const opened = openSurveillanceCase({ accountId: 'desk', marketId: 'BTC/USDT', reason: 'self_trade' });
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.case).not.toHaveProperty('fine');
      expect(opened.case).not.toHaveProperty('amount');
      expect(opened.case).not.toHaveProperty('closed');
    }
  });
});
