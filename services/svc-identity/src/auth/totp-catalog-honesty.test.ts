import { describe, expect, it } from 'vitest';
import {
  defaultTotpPolicy,
  isDefaultTotpPolicy,
  totpPolicyBoardCard,
  totpPolicyStatusLine,
  parseTotpPolicyStatusLine,
  totpPolicyStatusLineMatches,
  totpPolicyStatusLineConsistent,
  totpPolicyExportHeader,
  totpPolicyExportLine,
  totpPolicyExportText,
  isDeclaredTotpAlgorithm,
  totpDigitsInRange,
  TOTP_ALGORITHMS,
  TOTP_DEFAULT_STEP_SECONDS,
  TOTP_DEFAULT_DIGITS,
} from './totp-catalog-honesty.js';

describe('L3 wave81 totp catalog honesty', () => {
  it('default and non-default policy boards', () => {
    const d = defaultTotpPolicy();
    expect(d.step).toBe(TOTP_DEFAULT_STEP_SECONDS);
    expect(d.digits).toBe(TOTP_DEFAULT_DIGITS);
    expect(isDefaultTotpPolicy(d)).toBe(true);
    expect(totpPolicyBoardCard(d)).toEqual({
      step: 30,
      digits: 6,
      algorithm: 'sha1',
      isDefault: 1,
      algorithmsCatalog: 3,
    });
    expect(totpPolicyStatusLine(d)).toBe(
      'step=30 digits=6 algorithm=sha1 default=1 alg_catalog=3',
    );
    expect(totpPolicyStatusLineMatches(d)).toBe(true);
    expect(totpPolicyStatusLineConsistent(totpPolicyStatusLine(d))).toBe(true);
    expect(totpPolicyExportText(d).startsWith(totpPolicyExportHeader())).toBe(true);
    expect(totpPolicyExportLine(d)).toBe('30,6,sha1,1,3');
    expect(TOTP_ALGORITHMS).toHaveLength(3);
    expect(isDeclaredTotpAlgorithm('sha256')).toBe(true);
    expect(isDeclaredTotpAlgorithm('md5')).toBe(false);
    expect(totpDigitsInRange(d, 6, 8)).toBe(true);
    expect(totpDigitsInRange(d, 7, 8)).toBe(false);

    const custom = { step: 60, digits: 8, algorithm: 'sha256' as const };
    expect(isDefaultTotpPolicy(custom)).toBe(false);
    expect(totpPolicyStatusLineMatches(custom)).toBe(true);
    expect(parseTotpPolicyStatusLine('nope')).toBeNull();
  });
});
