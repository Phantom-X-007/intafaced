import { describe, expect, it } from 'vitest';
import {
  serviceAuthCatalogBoardCard,
  serviceAuthCatalogStatusLine,
  parseServiceAuthCatalogStatusLine,
  serviceAuthCatalogStatusLineMatches,
  serviceAuthCatalogStatusLineConsistent,
  serviceAuthCatalogExportHeader,
  serviceAuthCatalogExportLine,
  serviceAuthCatalogExportText,
  isDeclaredServiceAuthHeader,
  isDeclaredBodyBindMode,
  serviceAuthHeaderNames,
  SERVICE_AUTH_HEADER_NAMES,
  SERVICE_CALL_MAX_SKEW_SECONDS,
} from './service-auth-headers-honesty.js';

describe('L3 wave85 service-auth headers honesty', () => {
  it('catalog boards', () => {
    expect(SERVICE_AUTH_HEADER_NAMES).toHaveLength(4);
    expect(SERVICE_CALL_MAX_SKEW_SECONDS).toBe(300);
    expect(serviceAuthCatalogBoardCard()).toEqual({
      headers: 4,
      maxSkewSeconds: 300,
      bindModes: 2,
      defaultBind: 'accept-both',
    });
    expect(serviceAuthCatalogStatusLine()).toBe(
      'headers=4 max_skew_s=300 bind_modes=2 default_bind=accept-both',
    );
    expect(serviceAuthCatalogStatusLineMatches()).toBe(true);
    expect(serviceAuthCatalogStatusLineConsistent(serviceAuthCatalogStatusLine())).toBe(true);
    expect(serviceAuthCatalogExportText().startsWith(serviceAuthCatalogExportHeader())).toBe(true);
    expect(serviceAuthCatalogExportLine()).toBe('4,300,2,accept-both');
    expect(isDeclaredServiceAuthHeader('x-intafaced-service-sig')).toBe(true);
    expect(isDeclaredServiceAuthHeader('x-forged')).toBe(false);
    expect(isDeclaredBodyBindMode('require')).toBe(true);
    expect(isDeclaredBodyBindMode('none')).toBe(false);
    expect(serviceAuthHeaderNames()).toContain('x-intafaced-service-body');
    expect(parseServiceAuthCatalogStatusLine('nope')).toBeNull();
  });
});
