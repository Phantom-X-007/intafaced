import { describe, expect, it } from 'vitest';
import {
  rawBodyCatalogBoardCard,
  rawBodyCatalogStatusLine,
  parseRawBodyCatalogStatusLine,
  rawBodyCatalogStatusLineMatches,
  rawBodyCatalogStatusLineConsistent,
  rawBodyCatalogExportHeader,
  rawBodyCatalogExportLine,
  rawBodyCatalogExportText,
  isDefaultRawBodyContentType,
  rawBodyDefaultContentTypes,
  RAW_BODY_DEFAULT_CONTENT_TYPES,
} from './raw-body-honesty.js';

describe('L3 wave97 raw-body catalog honesty', () => {
  it('default content-type catalog', () => {
    expect(RAW_BODY_DEFAULT_CONTENT_TYPES).toEqual(['application/json']);
    expect(rawBodyCatalogBoardCard()).toEqual({
      contentTypes: 1,
      hasJson: 1,
      hasMultipart: 0,
    });
    expect(rawBodyCatalogStatusLine()).toBe('content_types=1 json=1 multipart=0');
    expect(rawBodyCatalogStatusLineMatches()).toBe(true);
    expect(rawBodyCatalogStatusLineConsistent(rawBodyCatalogStatusLine())).toBe(true);
    expect(rawBodyCatalogExportText().startsWith(rawBodyCatalogExportHeader())).toBe(true);
    expect(rawBodyCatalogExportLine()).toBe('1,1,0');
    expect(isDefaultRawBodyContentType('application/json')).toBe(true);
    expect(isDefaultRawBodyContentType('multipart/form-data')).toBe(false);
    expect(rawBodyDefaultContentTypes()).toEqual(['application/json']);
    expect(parseRawBodyCatalogStatusLine('nope')).toBeNull();
  });
});
