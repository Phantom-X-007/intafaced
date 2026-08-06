import { describe, expect, it } from 'vitest';
import {
  muteErrorCatalogBoardCard,
  muteErrorCatalogStatusLine,
  parseMuteErrorCatalogStatusLine,
  muteErrorCatalogStatusLineMatches,
  muteErrorCatalogStatusLineConsistent,
  digestErrorCatalogBoardCard,
  digestErrorCatalogStatusLine,
  parseDigestErrorCatalogStatusLine,
  digestErrorCatalogStatusLineMatches,
  digestErrorCatalogStatusLineConsistent,
  isDeclaredMuteErrorCode,
  isDeclaredDigestErrorCode,
  MUTE_UPDATE_ERROR_CODES,
  DIGEST_ERROR_CODES,
} from './preference-error-honesty.js';

describe('L3 wave134 preference error catalog honesty', () => {
  it('mute and digest error catalogs', () => {
    expect(MUTE_UPDATE_ERROR_CODES).toHaveLength(2);
    expect(DIGEST_ERROR_CODES).toHaveLength(2);
    expect(muteErrorCatalogBoardCard()).toEqual({
      codes: 2,
      hasCriticalCannotMute: 1,
      hasInvalidChannel: 1,
    });
    expect(muteErrorCatalogStatusLineMatches()).toBe(true);
    expect(muteErrorCatalogStatusLineConsistent(muteErrorCatalogStatusLine())).toBe(true);
    expect(isDeclaredMuteErrorCode('preference.critical_cannot_mute')).toBe(true);
    expect(isDeclaredMuteErrorCode('preference.ok')).toBe(false);
    expect(parseMuteErrorCatalogStatusLine('nope')).toBeNull();

    expect(digestErrorCatalogBoardCard()).toEqual({
      codes: 2,
      hasInvalidCadence: 1,
      hasCriticalNoDigest: 1,
    });
    expect(digestErrorCatalogStatusLineMatches()).toBe(true);
    expect(digestErrorCatalogStatusLineConsistent(digestErrorCatalogStatusLine())).toBe(true);
    expect(isDeclaredDigestErrorCode('preference.critical_no_digest')).toBe(true);
    expect(parseDigestErrorCatalogStatusLine('nope')).toBeNull();
  });
});
