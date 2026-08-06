import { describe, expect, it } from 'vitest';
import {
  toolModeCatalogBoardCard,
  toolModeCatalogStatusLine,
  parseToolModeCatalogStatusLine,
  toolModeCatalogStatusLineMatches,
  toolModeCatalogStatusLineConsistent,
  toolGrantListBoardCard,
  toolGrantListStatusLine,
  parseToolGrantListStatusLine,
  toolGrantListStatusLineMatches,
  toolGrantListStatusLineConsistent,
  toolGrantListExportHeader,
  toolGrantListExportLine,
  toolGrantListExportText,
  isDeclaredToolMode,
  TOOL_MODES,
  type ToolGrantBoardInput,
} from './tool-mode-honesty.js';

describe('L3 wave143 tool mode honesty', () => {
  it('mode catalog and grant list boards', () => {
    expect(TOOL_MODES).toEqual(['read', 'write']);
    expect(toolModeCatalogBoardCard()).toEqual({ modes: 2, hasRead: 1, hasWrite: 1 });
    expect(toolModeCatalogStatusLine()).toBe('modes=2 read=1 write=1');
    expect(toolModeCatalogStatusLineMatches()).toBe(true);
    expect(toolModeCatalogStatusLineConsistent(toolModeCatalogStatusLine())).toBe(true);
    expect(isDeclaredToolMode('read')).toBe(true);
    expect(isDeclaredToolMode('admin')).toBe(false);
    expect(parseToolModeCatalogStatusLine('nope')).toBeNull();

    const grants: readonly ToolGrantBoardInput[] = [
      { name: 'trade.quote', mode: 'read' },
      { name: 'trade.markets.list', mode: 'read' },
      { name: 'support.ticket.comment', mode: 'write' },
    ];
    expect(toolGrantListBoardCard(grants)).toEqual({ tools: 3, read: 2, write: 1 });
    expect(toolGrantListStatusLine(grants)).toBe('tools=3 read=2 write=1');
    expect(toolGrantListStatusLineMatches(grants)).toBe(true);
    expect(toolGrantListStatusLineConsistent(toolGrantListStatusLine(grants))).toBe(true);
    expect(toolGrantListExportText(grants).startsWith(toolGrantListExportHeader())).toBe(true);
    expect(toolGrantListExportLine(grants)).toBe('3,2,1');
    expect(parseToolGrantListStatusLine('nope')).toBeNull();
  });
});
