import { describe, expect, it } from 'vitest';
import {
  futuresPositionStatusCatalogBoardCard,
  futuresPositionStatusCatalogStatusLine,
  parseFuturesPositionStatusCatalogStatusLine,
  futuresPositionStatusCatalogStatusLineMatches,
  futuresPositionStatusCatalogStatusLineConsistent,
  futuresPositionStatusCatalogExportHeader,
  futuresPositionStatusCatalogExportLines,
  futuresPositionStatusCatalogExportText,
  isDeclaredFuturesPositionStatus,
  FUTURES_POSITION_STATUSES,
} from './futures-position-status-honesty.js';

describe('L3 wave225 futures-position-status catalog honesty', () => {
  it('futures position status catalog boards', () => {
    expect(FUTURES_POSITION_STATUSES).toEqual(['open', 'closed', 'liquidated']);
    expect(futuresPositionStatusCatalogBoardCard()).toEqual({
      statuses: 3,
      hasOpen: 1,
      hasClosed: 1,
      hasLiquidated: 1,
    });
    expect(futuresPositionStatusCatalogStatusLine()).toBe('statuses=3 open=1 closed=1 liquidated=1');
    expect(futuresPositionStatusCatalogStatusLineMatches()).toBe(true);
    expect(futuresPositionStatusCatalogStatusLineConsistent(futuresPositionStatusCatalogStatusLine())).toBe(true);
    expect(futuresPositionStatusCatalogExportText().startsWith(futuresPositionStatusCatalogExportHeader())).toBe(true);
    expect(futuresPositionStatusCatalogExportLines()).toEqual([...FUTURES_POSITION_STATUSES]);
    expect(isDeclaredFuturesPositionStatus('liquidated')).toBe(true);
    expect(isDeclaredFuturesPositionStatus('pending')).toBe(false);
    expect(parseFuturesPositionStatusCatalogStatusLine('nope')).toBeNull();
  });
});
