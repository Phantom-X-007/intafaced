import { describe, expect, it } from 'vitest';
import {
  serviceBodyBindCatalogBoardCard,
  serviceBodyBindCatalogStatusLine,
  parseServiceBodyBindCatalogStatusLine,
  serviceBodyBindCatalogStatusLineMatches,
  serviceBodyBindCatalogStatusLineConsistent,
  serviceBodyBindCatalogExportHeader,
  serviceBodyBindCatalogExportLines,
  serviceBodyBindCatalogExportText,
  isDeclaredServiceBodyBindMode,
  SERVICE_BODY_BIND_MODES,
} from './service-body-bind-honesty.js';

describe('L3 wave171 service body-bind catalog honesty', () => {
  it('mode catalog boards', () => {
    expect(SERVICE_BODY_BIND_MODES).toEqual(['accept-both', 'require']);
    expect(serviceBodyBindCatalogBoardCard()).toEqual({
      modes: 2,
      hasAcceptBoth: 1,
      hasRequire: 1,
    });
    expect(serviceBodyBindCatalogStatusLine()).toBe('modes=2 accept_both=1 require=1');
    expect(serviceBodyBindCatalogStatusLineMatches()).toBe(true);
    expect(serviceBodyBindCatalogStatusLineConsistent(serviceBodyBindCatalogStatusLine())).toBe(true);
    expect(serviceBodyBindCatalogExportText().startsWith(serviceBodyBindCatalogExportHeader())).toBe(true);
    expect(serviceBodyBindCatalogExportLines()).toEqual([...SERVICE_BODY_BIND_MODES]);
    expect(isDeclaredServiceBodyBindMode('require')).toBe(true);
    expect(isDeclaredServiceBodyBindMode('optional')).toBe(false);
    expect(parseServiceBodyBindCatalogStatusLine('nope')).toBeNull();
  });
});
