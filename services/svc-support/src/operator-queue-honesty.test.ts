import { describe, expect, it } from 'vitest';
import {
  queueWeightCatalogBoardCard,
  queueWeightCatalogStatusLine,
  parseQueueWeightCatalogStatusLine,
  queueWeightCatalogStatusLineMatches,
  operatorQueueBoardCard,
  operatorQueueStatusLine,
  parseOperatorQueueStatusLine,
  operatorQueueStatusLineMatches,
  operatorQueueStatusLineConsistent,
  operatorQueueExportHeader,
  operatorQueueExportLine,
  operatorQueueExportText,
  queueEntryCountInRange,
  QUEUE_CATEGORY_WEIGHTS,
  type QueueResultBoardInput,
} from './operator-queue-honesty.js';

describe('L3 wave99 operator queue honesty', () => {
  it('weight catalog and queue boards', () => {
    expect(QUEUE_CATEGORY_WEIGHTS.deposit_withdraw).toBe(70);
    expect(queueWeightCatalogBoardCard()).toEqual({
      categories: 4,
      maxWeight: 70,
      minWeight: 10,
    });
    expect(queueWeightCatalogStatusLineMatches()).toBe(true);
    expect(parseQueueWeightCatalogStatusLine(queueWeightCatalogStatusLine())).toEqual({
      categories: 4,
      maxWeight: 70,
      minWeight: 10,
    });

    const empty: QueueResultBoardInput = { status: 'empty' };
    expect(operatorQueueBoardCard(empty).entries).toBe(0);
    expect(operatorQueueStatusLineMatches(empty)).toBe(true);
    expect(operatorQueueStatusLineConsistent(operatorQueueStatusLine(empty))).toBe(true);

    const ok: QueueResultBoardInput = {
      status: 'ok',
      entries: [
        { category: 'account', status: 'open', score: 50 },
        { category: 'trading', status: 'pending', score: 40 },
        { category: 'deposit_withdraw', status: 'open', score: 90 },
      ],
    };
    expect(operatorQueueBoardCard(ok)).toEqual({
      status: 'ok',
      entries: 3,
      open: 2,
      pending: 1,
    });
    expect(operatorQueueStatusLine(ok)).toBe('status=ok entries=3 open=2 pending=1');
    expect(operatorQueueStatusLineMatches(ok)).toBe(true);
    expect(operatorQueueStatusLineConsistent(operatorQueueStatusLine(ok))).toBe(true);
    expect(operatorQueueExportText(ok).startsWith(operatorQueueExportHeader())).toBe(true);
    expect(operatorQueueExportLine(ok)).toBe('ok,3,2,1');
    expect(queueEntryCountInRange(ok, 3, 3)).toBe(true);
    expect(parseOperatorQueueStatusLine('nope')).toBeNull();
  });
});
