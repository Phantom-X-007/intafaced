import { describe, expect, it } from 'vitest';
import {
  scannerRankBoardCard,
  scannerRankStatusLine,
  parseScannerRankStatusLine,
  scannerRankStatusLineMatches,
  scannerRankStatusLineConsistent,
  scannerRankExportHeader,
  scannerRankExportLine,
  scannerRankExportText,
  scannerRankIsEmpty,
  scannerSignalCountInRange,
  type ScannerRankResultInput,
} from './rank-honesty.js';

describe('L3 wave101 scanner rank honesty', () => {
  it('ok empty unavailable boards', () => {
    const ok: ScannerRankResultInput = {
      status: 'ok',
      signals: [
        { marketId: 'ETH-USD', score: '1.234567' },
        { marketId: 'BTC-USD', score: '0.100000' },
      ],
      skippedIncomplete: 1,
      skippedStale: 0,
    };
    expect(scannerRankBoardCard(ok)).toEqual({
      status: 'ok',
      signals: 2,
      skippedIncomplete: 1,
      skippedStale: 0,
      reason: '-',
    });
    expect(scannerRankStatusLine(ok)).toBe(
      'status=ok signals=2 incomplete=1 stale=0 reason=-',
    );
    expect(scannerRankStatusLineMatches(ok)).toBe(true);
    expect(scannerRankStatusLineConsistent(scannerRankStatusLine(ok))).toBe(true);
    expect(scannerRankExportText(ok).startsWith(scannerRankExportHeader())).toBe(true);
    expect(scannerRankExportLine(ok)).toBe('ok,2,1,0,-');
    expect(scannerSignalCountInRange(ok, 2, 2)).toBe(true);

    const empty: ScannerRankResultInput = { status: 'empty' };
    expect(scannerRankIsEmpty(empty)).toBe(true);
    expect(scannerRankStatusLineMatches(empty)).toBe(true);
    expect(scannerRankStatusLineConsistent(scannerRankStatusLine(empty))).toBe(true);

    const stale: ScannerRankResultInput = { status: 'unavailable', reason: 'stale' };
    expect(scannerRankBoardCard(stale).reason).toBe('stale');
    expect(scannerRankStatusLineMatches(stale)).toBe(true);
    expect(parseScannerRankStatusLine('nope')).toBeNull();
  });
});
