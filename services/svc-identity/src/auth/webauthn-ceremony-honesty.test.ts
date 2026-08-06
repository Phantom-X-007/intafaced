import { describe, expect, it } from 'vitest';
import {
  webauthnCeremonyCatalogBoardCard,
  webauthnCeremonyCatalogStatusLine,
  parseWebauthnCeremonyCatalogStatusLine,
  webauthnCeremonyCatalogStatusLineMatches,
  webauthnCeremonyCatalogStatusLineConsistent,
  webauthnCeremonyBoardCard,
  webauthnCeremonyStatusLine,
  parseWebauthnCeremonyStatusLine,
  webauthnCeremonyStatusLineMatches,
  webauthnCeremonyStatusLineConsistent,
  webauthnCeremonyExportHeader,
  webauthnCeremonyExportLine,
  webauthnCeremonyExportText,
  isDeclaredWebauthnCeremony,
  WEBAUTHN_CEREMONY_TYPES,
} from './webauthn-ceremony-honesty.js';

describe('L3 wave91 webauthn ceremony honesty', () => {
  it('catalog and ceremony boards', () => {
    expect(WEBAUTHN_CEREMONY_TYPES).toEqual(['webauthn.create', 'webauthn.get']);
    expect(webauthnCeremonyCatalogBoardCard()).toEqual({
      ceremonies: 2,
      create: 1,
      get: 1,
    });
    expect(webauthnCeremonyCatalogStatusLineMatches()).toBe(true);
    expect(webauthnCeremonyCatalogStatusLineConsistent(webauthnCeremonyCatalogStatusLine())).toBe(
      true,
    );
    expect(parseWebauthnCeremonyCatalogStatusLine('nope')).toBeNull();

    const ready = {
      type: 'webauthn.create' as const,
      hasChallenge: true,
      hasOrigin: true,
    };
    expect(webauthnCeremonyBoardCard(ready).ready).toBe(1);
    expect(webauthnCeremonyStatusLine(ready)).toBe('type=create challenge=1 origin=1 ready=1');
    expect(webauthnCeremonyStatusLineMatches(ready)).toBe(true);
    expect(webauthnCeremonyStatusLineConsistent(webauthnCeremonyStatusLine(ready))).toBe(true);
    expect(webauthnCeremonyExportText(ready).startsWith(webauthnCeremonyExportHeader())).toBe(true);
    expect(webauthnCeremonyExportLine(ready)).toBe('create,1,1,1');

    const incomplete = {
      type: 'webauthn.get' as const,
      hasChallenge: true,
      hasOrigin: false,
    };
    expect(webauthnCeremonyBoardCard(incomplete).ready).toBe(0);
    expect(webauthnCeremonyStatusLineMatches(incomplete)).toBe(true);
    expect(isDeclaredWebauthnCeremony('webauthn.get')).toBe(true);
    expect(isDeclaredWebauthnCeremony('webauthn.fake')).toBe(false);
    expect(parseWebauthnCeremonyStatusLine('nope')).toBeNull();
  });
});
