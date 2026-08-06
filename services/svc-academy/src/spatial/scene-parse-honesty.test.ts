import { describe, expect, it } from 'vitest';
import {
  sceneParseCatalogBoardCard,
  sceneParseCatalogStatusLine,
  parseSceneParseCatalogStatusLine,
  sceneParseCatalogStatusLineMatches,
  sceneParseResultBoardCard,
  sceneParseResultStatusLine,
  parseSceneParseResultStatusLine,
  sceneParseResultStatusLineMatches,
  sceneParseResultStatusLineConsistent,
  sceneParseResultExportHeader,
  sceneParseResultExportLine,
  sceneParseResultExportText,
  isDeclaredSceneParseRefuseReason,
  SCENE_PARSE_REFUSE_REASONS,
  type SceneParseBoardInput,
} from './scene-parse-honesty.js';

describe('L3 wave147 scene parse honesty', () => {
  it('catalog and result boards', () => {
    expect(SCENE_PARSE_REFUSE_REASONS).toEqual(['invalid', 'oversized']);
    expect(sceneParseCatalogBoardCard()).toEqual({
      reasons: 2,
      hasInvalid: 1,
      hasOversized: 1,
    });
    expect(sceneParseCatalogStatusLineMatches()).toBe(true);
    expect(parseSceneParseCatalogStatusLine(sceneParseCatalogStatusLine())).toEqual({
      reasons: 2,
      invalid: 1,
      oversized: 1,
    });
    expect(isDeclaredSceneParseRefuseReason('oversized')).toBe(true);
    expect(isDeclaredSceneParseRefuseReason('empty')).toBe(false);

    const ok: SceneParseBoardInput = { ok: true };
    expect(sceneParseResultBoardCard(ok)).toEqual({ ok: 1, reason: '-' });
    expect(sceneParseResultStatusLineMatches(ok)).toBe(true);
    expect(sceneParseResultStatusLineConsistent(sceneParseResultStatusLine(ok))).toBe(true);
    expect(sceneParseResultExportText(ok).startsWith(sceneParseResultExportHeader())).toBe(true);
    expect(sceneParseResultExportLine(ok)).toBe('1,-');

    const bad: SceneParseBoardInput = { ok: false, reason: 'oversized' };
    expect(sceneParseResultStatusLine(bad)).toBe('ok=0 reason=oversized');
    expect(sceneParseResultStatusLineMatches(bad)).toBe(true);
    expect(parseSceneParseResultStatusLine('nope')).toBeNull();
  });
});
