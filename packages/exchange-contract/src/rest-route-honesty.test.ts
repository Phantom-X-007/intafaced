import { describe, expect, it } from 'vitest';
import {
  restRouteCatalogBoardCard,
  restRouteCatalogStatusLine,
  parseRestRouteCatalogStatusLine,
  restRouteCatalogStatusLineMatches,
  restRouteCatalogStatusLineConsistent,
  restRouteCatalogExportHeader,
  restRouteCatalogExportLines,
  restRouteCatalogExportText,
  isDeclaredRestRoute,
  REST_ROUTE_NAMES,
} from './rest-route-honesty.js';

describe('L3 wave208 rest-route catalog honesty', () => {
  it('rest route catalog boards', () => {
    expect(REST_ROUTE_NAMES).toHaveLength(19);
    expect(REST_ROUTE_NAMES).toContain('cancelOrder');
    expect(restRouteCatalogBoardCard()).toEqual({
      routes: 19,
      publicCount: 7,
      privateCount: 12,
      hasCreateOrder: 1,
      hasCancelOrder: 1,
    });
    expect(restRouteCatalogStatusLine()).toBe('routes=19 public=7 private=12 create_order=1 cancel_order=1');
    expect(restRouteCatalogStatusLineMatches()).toBe(true);
    expect(restRouteCatalogStatusLineConsistent(restRouteCatalogStatusLine())).toBe(true);
    expect(restRouteCatalogExportText().startsWith(restRouteCatalogExportHeader())).toBe(true);
    expect(restRouteCatalogExportLines()).toEqual([...REST_ROUTE_NAMES]);
    expect(isDeclaredRestRoute('fetchMarkets')).toBe(true);
    expect(isDeclaredRestRoute('placeOrder')).toBe(false);
    expect(parseRestRouteCatalogStatusLine('nope')).toBeNull();
  });
});
