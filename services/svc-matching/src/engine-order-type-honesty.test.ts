import { describe, expect, it } from 'vitest';
import {
  engineOrderTypeCatalogBoardCard,
  engineOrderTypeCatalogStatusLine,
  parseEngineOrderTypeCatalogStatusLine,
  engineOrderTypeCatalogStatusLineMatches,
  engineOrderTypeCatalogStatusLineConsistent,
  engineOrderTypeCatalogExportHeader,
  engineOrderTypeCatalogExportLines,
  engineOrderTypeCatalogExportText,
  isDeclaredEngineOrderType,
  ENGINE_ORDER_TYPES,
} from './engine-order-type-honesty.js';

describe('L3 wave194 engine-order-type catalog honesty', () => {
  it('engine order type catalog boards', () => {
    expect(ENGINE_ORDER_TYPES).toEqual(['market', 'limit', 'stop', 'stop_limit']);
    expect(engineOrderTypeCatalogBoardCard()).toEqual({
      types: 4,
      hasMarket: 1,
      hasLimit: 1,
      hasStop: 1,
      hasStopLimit: 1,
      hasTakeProfit: 0,
    });
    expect(engineOrderTypeCatalogStatusLine()).toBe('types=4 market=1 limit=1 stop=1 stop_limit=1 take_profit=0');
    expect(engineOrderTypeCatalogStatusLineMatches()).toBe(true);
    expect(engineOrderTypeCatalogStatusLineConsistent(engineOrderTypeCatalogStatusLine())).toBe(true);
    expect(engineOrderTypeCatalogExportText().startsWith(engineOrderTypeCatalogExportHeader())).toBe(true);
    expect(engineOrderTypeCatalogExportLines()).toEqual([...ENGINE_ORDER_TYPES]);
    expect(isDeclaredEngineOrderType('stop_limit')).toBe(true);
    expect(isDeclaredEngineOrderType('take_profit')).toBe(false);
    expect(parseEngineOrderTypeCatalogStatusLine('nope')).toBeNull();
  });
});
