import { describe, expect, it } from 'vitest';
import {
  cardRendererErrorCatalogBoardCard,
  cardRendererErrorCatalogStatusLine,
  parseCardRendererErrorCatalogStatusLine,
  cardRendererErrorCatalogStatusLineMatches,
  cardRendererErrorCatalogStatusLineConsistent,
  cardRendererErrorCatalogExportHeader,
  cardRendererErrorCatalogExportLines,
  cardRendererErrorCatalogExportText,
  isDeclaredCardRendererErrorCode,
  CARD_RENDERER_ERROR_CODES,
} from './card-renderer-error-honesty.js';

describe('L3 wave166 card-renderer error catalog honesty', () => {
  it('error catalog boards', () => {
    expect(CARD_RENDERER_ERROR_CODES).toHaveLength(3);
    expect(cardRendererErrorCatalogBoardCard()).toEqual({
      codes: 3,
      hasUnconfigured: 1,
      hasUnreachable: 1,
      hasProtocol: 1,
    });
    expect(cardRendererErrorCatalogStatusLine()).toBe('codes=3 unconfigured=1 unreachable=1 protocol=1');
    expect(cardRendererErrorCatalogStatusLineMatches()).toBe(true);
    expect(cardRendererErrorCatalogStatusLineConsistent(cardRendererErrorCatalogStatusLine())).toBe(true);
    expect(cardRendererErrorCatalogExportText().startsWith(cardRendererErrorCatalogExportHeader())).toBe(true);
    expect(cardRendererErrorCatalogExportLines()).toEqual([...CARD_RENDERER_ERROR_CODES]);
    expect(isDeclaredCardRendererErrorCode('blueprint.card_renderer_protocol')).toBe(true);
    expect(isDeclaredCardRendererErrorCode('blueprint.other')).toBe(false);
    expect(parseCardRendererErrorCatalogStatusLine('nope')).toBeNull();
  });
});
