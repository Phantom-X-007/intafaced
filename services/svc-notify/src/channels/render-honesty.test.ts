import { describe, expect, it } from 'vitest';
import {
  renderedCopyBoardCard,
  renderedCopyStatusLine,
  parseRenderedCopyStatusLine,
  renderedCopyStatusLineMatches,
  renderedCopyStatusLineConsistent,
  renderedCopyExportHeader,
  renderedCopyExportLine,
  renderedCopyExportText,
  renderedBodyLenAtLeast,
  type RenderedCopyBoardInput,
} from './render-boards.js';

describe('L3 wave55 render honesty boards', () => {
  const copy: RenderedCopyBoardInput = { title: 'Confirm email', body: 'Code 123456 expires in 10 minutes.' };

  it('status export and range guards', () => {
    expect(renderedCopyBoardCard(copy).titleLen).toBe(copy.title.length);
    expect(renderedCopyBoardCard(copy).bodyLen).toBe(copy.body.length);
    expect(renderedCopyStatusLineMatches(copy)).toBe(true);
    expect(renderedCopyStatusLineConsistent(renderedCopyStatusLine(copy))).toBe(true);
    expect(parseRenderedCopyStatusLine('nope')).toBeNull();
    expect(renderedCopyExportText(copy).startsWith(renderedCopyExportHeader())).toBe(true);
    expect(renderedCopyExportLine(copy)).toBe(`${copy.title.length},${copy.body.length}`);
    expect(renderedBodyLenAtLeast(copy, 1)).toBe(true);
    expect(renderedBodyLenAtLeast(copy, Number.NaN)).toBe(false);

    const empty: RenderedCopyBoardInput = { title: '', body: '' };
    expect(renderedCopyBoardCard(empty).emptyTitle).toBe(true);
    expect(renderedCopyStatusLineMatches(empty)).toBe(true);
  });
});
