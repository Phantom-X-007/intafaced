import { describe, expect, it } from 'vitest';
import {
  queueWeightCatalogBoardCard,
  queueWeightCatalogStatusLine,
  parseQueueWeightCatalogStatusLine,
  queueWeightCatalogStatusLineMatches,
  queueWeightCatalogStatusLineConsistent,
  queueWeightCatalogExportHeader,
  queueWeightCatalogExportLines,
  queueWeightCatalogExportText,
  isDeclaredQueueWeightCategory,
  QUEUE_WEIGHT_CATEGORIES,
} from './queue-weight-honesty.js';

describe('L3 wave175 queue weight catalog honesty', () => {
  it('queue weight catalog boards', () => {
    expect(QUEUE_WEIGHT_CATEGORIES).toEqual(['account', 'trading', 'deposit_withdraw', 'other']);
    expect(queueWeightCatalogBoardCard()).toEqual({
      categories: 4,
      maxWeight: 70,
      minWeight: 10,
      depositHighest: 1,
    });
    expect(queueWeightCatalogStatusLine()).toBe('categories=4 max=70 min=10 deposit_highest=1');
    expect(queueWeightCatalogStatusLineMatches()).toBe(true);
    expect(queueWeightCatalogStatusLineConsistent(queueWeightCatalogStatusLine())).toBe(true);
    expect(queueWeightCatalogExportText().startsWith(queueWeightCatalogExportHeader())).toBe(true);
    expect(queueWeightCatalogExportLines()).toHaveLength(4);
    expect(isDeclaredQueueWeightCategory('deposit_withdraw')).toBe(true);
    expect(isDeclaredQueueWeightCategory('vip')).toBe(false);
    expect(parseQueueWeightCatalogStatusLine('nope')).toBeNull();
  });
});
