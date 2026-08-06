import { describe, expect, it } from 'vitest';
import {
  edgeHeaderCatalogSize,
  isDeclaredEdgeHeader,
  edgeHeaderCatalogBoardCard,
  edgeHeaderCatalogStatusLine,
  parseEdgeHeaderCatalogStatusLine,
  edgeHeaderCatalogStatusLineMatches,
  edgeHeaderCatalogStatusLineConsistent,
  edgeHeaderCatalogExportHeader,
  edgeHeaderCatalogExportLine,
  edgeHeaderCatalogExportText,
  edgeHeaderNames,
  EDGE_PRINCIPAL_HEADER_NAME,
  EDGE_SIGNATURE_HEADER_NAME,
} from './edge-headers-honesty.js';

describe('L3 wave82 edge headers honesty', () => {
  it('catalog boards', () => {
    expect(edgeHeaderCatalogSize()).toBe(2);
    expect(EDGE_PRINCIPAL_HEADER_NAME).toBe('x-intafaced-principal');
    expect(EDGE_SIGNATURE_HEADER_NAME).toBe('x-intafaced-principal-sig');
    expect(isDeclaredEdgeHeader(EDGE_PRINCIPAL_HEADER_NAME)).toBe(true);
    expect(isDeclaredEdgeHeader('x-forged')).toBe(false);
    expect(edgeHeaderCatalogBoardCard()).toEqual({
      headers: 2,
      hasPrincipal: 1,
      hasSignature: 1,
    });
    expect(edgeHeaderCatalogStatusLine()).toBe('headers=2 principal=1 signature=1');
    expect(edgeHeaderCatalogStatusLineMatches()).toBe(true);
    expect(edgeHeaderCatalogStatusLineConsistent(edgeHeaderCatalogStatusLine())).toBe(true);
    expect(edgeHeaderCatalogExportText().startsWith(edgeHeaderCatalogExportHeader())).toBe(true);
    expect(edgeHeaderCatalogExportLine()).toBe('2,1,1');
    expect(edgeHeaderNames()).toEqual(['x-intafaced-principal', 'x-intafaced-principal-sig']);
    expect(parseEdgeHeaderCatalogStatusLine('nope')).toBeNull();
  });
});
