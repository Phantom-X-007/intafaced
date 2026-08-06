import { describe, expect, it } from 'vitest';
import {
  certGrantStateCatalogBoardCard,
  certGrantStateCatalogStatusLine,
  parseCertGrantStateCatalogStatusLine,
  certGrantStateCatalogStatusLineMatches,
  certGrantStateCatalogStatusLineConsistent,
  certGrantStateCatalogExportHeader,
  certGrantStateCatalogExportLines,
  certGrantStateCatalogExportText,
  isDeclaredCertGrantState,
  CERT_GRANT_STATES,
} from './cert-grant-state-honesty.js';

describe('L3 wave157 cert grant state catalog honesty', () => {
  it('grant state catalog boards', () => {
    expect(CERT_GRANT_STATES).toEqual(['not_started', 'in_progress', 'grantable', 'granted']);
    expect(certGrantStateCatalogBoardCard()).toEqual({
      states: 4,
      hasNotStarted: 1,
      hasInProgress: 1,
      hasGrantable: 1,
      hasGranted: 1,
    });
    expect(certGrantStateCatalogStatusLine()).toBe('states=4 not_started=1 in_progress=1 grantable=1 granted=1');
    expect(certGrantStateCatalogStatusLineMatches()).toBe(true);
    expect(certGrantStateCatalogStatusLineConsistent(certGrantStateCatalogStatusLine())).toBe(true);
    expect(certGrantStateCatalogExportText().startsWith(certGrantStateCatalogExportHeader())).toBe(true);
    expect(certGrantStateCatalogExportLines()).toEqual([...CERT_GRANT_STATES]);
    expect(isDeclaredCertGrantState('grantable')).toBe(true);
    expect(isDeclaredCertGrantState('revoked')).toBe(false);
    expect(parseCertGrantStateCatalogStatusLine('nope')).toBeNull();
  });
});
