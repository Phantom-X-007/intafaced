import { describe, expect, it } from 'vitest';
import {
  edgePrincipalHeaderCatalogBoardCard,
  edgePrincipalHeaderCatalogStatusLine,
  parseEdgePrincipalHeaderCatalogStatusLine,
  edgePrincipalHeaderCatalogStatusLineMatches,
  edgePrincipalHeaderCatalogStatusLineConsistent,
  edgePrincipalHeaderCatalogExportHeader,
  edgePrincipalHeaderCatalogExportLines,
  edgePrincipalHeaderCatalogExportText,
  isDeclaredEdgePrincipalHeader,
  EDGE_PRINCIPAL_HEADERS,
} from './edge-principal-header-honesty.js';

describe('L3 wave169 edge principal header catalog honesty', () => {
  it('header catalog boards', () => {
    expect(EDGE_PRINCIPAL_HEADERS).toEqual(['x-intafaced-principal', 'x-intafaced-principal-sig']);
    expect(edgePrincipalHeaderCatalogBoardCard()).toEqual({
      headers: 2,
      hasPrincipal: 1,
      hasSig: 1,
    });
    expect(edgePrincipalHeaderCatalogStatusLine()).toBe('headers=2 principal=1 sig=1');
    expect(edgePrincipalHeaderCatalogStatusLineMatches()).toBe(true);
    expect(edgePrincipalHeaderCatalogStatusLineConsistent(edgePrincipalHeaderCatalogStatusLine())).toBe(true);
    expect(edgePrincipalHeaderCatalogExportText().startsWith(edgePrincipalHeaderCatalogExportHeader())).toBe(true);
    expect(edgePrincipalHeaderCatalogExportLines()).toEqual([...EDGE_PRINCIPAL_HEADERS]);
    expect(isDeclaredEdgePrincipalHeader('x-intafaced-principal')).toBe(true);
    expect(isDeclaredEdgePrincipalHeader('x-auth-token')).toBe(false);
    expect(parseEdgePrincipalHeaderCatalogStatusLine('nope')).toBeNull();
  });
});
