import { describe, expect, it } from 'vitest';
import {
  sceneBudgetCatalogBoardCard,
  sceneBudgetCatalogStatusLine,
  parseSceneBudgetCatalogStatusLine,
  sceneBudgetCatalogStatusLineMatches,
  sceneBudgetBoardCard,
  sceneBudgetStatusLine,
  parseSceneBudgetStatusLine,
  sceneBudgetStatusLineMatches,
  sceneBudgetStatusLineConsistent,
  sceneBudgetExportHeader,
  sceneBudgetExportLine,
  sceneBudgetExportText,
  sceneWithinBudget,
  SCENE_MAX_BYTES,
  SCENE_VERSION,
} from './scene-budget-honesty.js';

describe('L3 wave111 scene budget honesty', () => {
  it('catalog and scene boards', () => {
    expect(SCENE_MAX_BYTES).toBe(64 * 1024);
    expect(SCENE_VERSION).toBe(1);
    expect(sceneBudgetCatalogBoardCard()).toEqual({ maxBytes: 65536, version: 1 });
    expect(sceneBudgetCatalogStatusLineMatches()).toBe(true);
    expect(parseSceneBudgetCatalogStatusLine(sceneBudgetCatalogStatusLine())).toEqual({
      maxBytes: 65536,
      version: 1,
    });

    const ok = { byteSize: 1000, version: 1, avatarCount: 2, propCount: 1 };
    expect(sceneBudgetBoardCard(ok).withinBudget).toBe(1);
    expect(sceneBudgetStatusLine(ok)).toBe('bytes=1000 version=1 avatars=2 props=1 within=1');
    expect(sceneBudgetStatusLineMatches(ok)).toBe(true);
    expect(sceneBudgetStatusLineConsistent(sceneBudgetStatusLine(ok))).toBe(true);
    expect(sceneBudgetExportText(ok).startsWith(sceneBudgetExportHeader())).toBe(true);
    expect(sceneBudgetExportLine(ok)).toBe('1000,1,2,1,1');
    expect(sceneWithinBudget(1000)).toBe(true);

    const over = { byteSize: SCENE_MAX_BYTES + 1, version: 1, avatarCount: 0, propCount: 0 };
    expect(sceneBudgetBoardCard(over).withinBudget).toBe(0);
    expect(sceneWithinBudget(over.byteSize)).toBe(false);
    expect(sceneBudgetStatusLineMatches(over)).toBe(true);
    expect(parseSceneBudgetStatusLine('nope')).toBeNull();
  });
});
