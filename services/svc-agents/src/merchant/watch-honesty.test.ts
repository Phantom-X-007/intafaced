import { describe, expect, it } from 'vitest';
import {
  watchAlertCount,
  watchResultBoardCard,
  watchResultStatusLine,
  parseWatchResultStatusLine,
  watchResultStatusLineMatches,
  watchResultStatusLineConsistent,
  watchResultExportHeader,
  watchResultExportLine,
  watchResultExportText,
  watchHasNoAlerts,
  watchAlertCountInRange,
  moneyWriteRefuseBoardCard,
  moneyWriteRefuseStatusLine,
  parseMoneyWriteRefuseStatusLine,
  moneyWriteRefuseStatusLineMatches,
  MERCHANT_MONEY_WRITE_TOOL_IDS,
  type WatchResultInput,
} from './watch-honesty.js';

describe('L3 wave68 merchant watch honesty', () => {
  it('ok / empty / unavailable boards', () => {
    const ok: WatchResultInput = {
      status: 'ok',
      considered: 3,
      skippedStale: 1,
      skippedIncomplete: 0,
      alerts: [
        {
          railId: 'card',
          approvalRate: '0.70',
          attempts: 100,
          threshold: '0.85',
          kind: 'below_threshold',
        },
      ],
    };
    expect(watchAlertCount(ok)).toBe(1);
    expect(watchResultBoardCard(ok).status).toBe('ok');
    expect(watchResultStatusLine(ok)).toBe(
      'status=ok alerts=1 considered=3 stale=1 incomplete=0 reason=-',
    );
    expect(watchResultStatusLineMatches(ok)).toBe(true);
    expect(watchResultStatusLineConsistent(watchResultStatusLine(ok))).toBe(true);
    expect(watchResultExportText(ok).startsWith(watchResultExportHeader())).toBe(true);
    expect(watchResultExportLine(ok)).toBe('ok,1,3,1,0,-');
    expect(watchHasNoAlerts(ok)).toBe(false);
    expect(watchAlertCountInRange(ok, 1, 1)).toBe(true);
    expect(watchAlertCountInRange(ok, 2, 1)).toBe(false);

    const empty: WatchResultInput = { status: 'empty' };
    expect(watchAlertCount(empty)).toBe(0);
    expect(watchResultStatusLineMatches(empty)).toBe(true);
    expect(watchResultStatusLineConsistent(watchResultStatusLine(empty))).toBe(true);
    expect(watchHasNoAlerts(empty)).toBe(true);

    const dark: WatchResultInput = { status: 'unavailable', reason: 'pay_plane_dark' };
    expect(watchResultBoardCard(dark).reason).toBe('pay_plane_dark');
    expect(watchResultStatusLineMatches(dark)).toBe(true);
    expect(watchResultStatusLineConsistent(watchResultStatusLine(dark))).toBe(true);
    expect(parseWatchResultStatusLine('nope')).toBeNull();
  });

  it('money-write refuse catalog boards', () => {
    expect(MERCHANT_MONEY_WRITE_TOOL_IDS).toContain('ledger.post');
    expect(moneyWriteRefuseBoardCard().tools).toBe(MERCHANT_MONEY_WRITE_TOOL_IDS.length);
    expect(moneyWriteRefuseStatusLineMatches()).toBe(true);
    expect(parseMoneyWriteRefuseStatusLine(moneyWriteRefuseStatusLine())?.tools).toBe(
      MERCHANT_MONEY_WRITE_TOOL_IDS.length,
    );
    expect(parseMoneyWriteRefuseStatusLine('nope')).toBeNull();
  });
});
