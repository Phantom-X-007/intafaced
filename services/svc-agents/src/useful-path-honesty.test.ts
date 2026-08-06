import { describe, expect, it } from 'vitest';
import {
  usefulPathCatalogBoardCard,
  usefulPathCatalogStatusLine,
  parseUsefulPathCatalogStatusLine,
  usefulPathCatalogStatusLineMatches,
  usefulPathCatalogStatusLineConsistent,
  usefulPathResultBoardCard,
  usefulPathResultStatusLine,
  parseUsefulPathResultStatusLine,
  usefulPathResultStatusLineMatches,
  usefulPathResultExportHeader,
  usefulPathResultExportLine,
  usefulPathResultExportText,
  USEFUL_PATH_PROBE_MESSAGE,
  USEFUL_PATH_CAPABILITY,
} from './useful-path-honesty.js';

describe('L3 wave103 useful-path honesty', () => {
  it('catalog and result boards', () => {
    expect(USEFUL_PATH_PROBE_MESSAGE).toBe('agents.useful_path.probe');
    expect(USEFUL_PATH_CAPABILITY).toBe('complete');
    expect(usefulPathCatalogBoardCard()).toEqual({
      probeKey: 'agents.useful_path.probe',
      capability: 'complete',
      hasSession: 0,
      hasLedger: 0,
    });
    expect(usefulPathCatalogStatusLineMatches()).toBe(true);
    expect(usefulPathCatalogStatusLineConsistent(usefulPathCatalogStatusLine())).toBe(true);
    expect(parseUsefulPathCatalogStatusLine('nope')).toBeNull();

    const result = {
      task: 'navigator.plan',
      textLen: 12,
      providerId: 'mock',
      model: 'mock-v1',
    };
    expect(usefulPathResultBoardCard(result)).toEqual({
      task: 'navigator.plan',
      textLen: 12,
      hasProvider: 1,
      hasModel: 1,
    });
    expect(usefulPathResultStatusLine(result)).toBe(
      'task=navigator.plan text_len=12 provider=1 model=1',
    );
    expect(usefulPathResultStatusLineMatches(result)).toBe(true);
    expect(usefulPathResultExportText(result).startsWith(usefulPathResultExportHeader())).toBe(
      true,
    );
    expect(usefulPathResultExportLine(result)).toBe('navigator.plan,12,1,1');
    expect(parseUsefulPathResultStatusLine('nope')).toBeNull();
  });
});
