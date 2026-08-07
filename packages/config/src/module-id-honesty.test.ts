import { describe, expect, it } from 'vitest';
import {
  moduleIdCatalogBoardCard,
  moduleIdCatalogStatusLine,
  parseModuleIdCatalogStatusLine,
  moduleIdCatalogStatusLineMatches,
  moduleIdCatalogStatusLineConsistent,
  moduleIdCatalogExportHeader,
  moduleIdCatalogExportLines,
  moduleIdCatalogExportText,
  isDeclaredModuleId,
  MODULE_IDS,
} from './module-id-honesty.js';

describe('L3 wave181 module-id catalog honesty', () => {
  it('module id catalog boards', () => {
    expect(MODULE_IDS.length).toBeGreaterThanOrEqual(20);
    expect(MODULE_IDS).toContain('identity');
    expect(MODULE_IDS).toContain('protocol');
    expect(moduleIdCatalogBoardCard()).toEqual({
      modules: MODULE_IDS.length,
      hasIdentity: 1,
      hasLedger: 1,
      hasTrade: 1,
      hasEdge: 1,
      hasProtocol: 1,
    });
    expect(moduleIdCatalogStatusLine()).toBe(`modules=${MODULE_IDS.length} identity=1 ledger=1 trade=1 edge=1 protocol=1`);
    expect(moduleIdCatalogStatusLineMatches()).toBe(true);
    expect(moduleIdCatalogStatusLineConsistent(moduleIdCatalogStatusLine())).toBe(true);
    expect(moduleIdCatalogExportText().startsWith(moduleIdCatalogExportHeader())).toBe(true);
    expect(moduleIdCatalogExportLines()).toEqual([...MODULE_IDS]);
    expect(isDeclaredModuleId('edge')).toBe(true);
    expect(isDeclaredModuleId('not-a-module')).toBe(false);
    expect(parseModuleIdCatalogStatusLine('nope')).toBeNull();
  });
});
