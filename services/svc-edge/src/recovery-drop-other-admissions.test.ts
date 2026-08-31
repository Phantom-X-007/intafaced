import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recoveryCodeDropsOtherAdmissions } from './recovery-drop-other-admissions.js';

const CODE = 'A1B2C-D3E4F';
const HASHES = ['hash-1'];

describe('recoveryCodeDropsOtherAdmissions', () => {
  it('refuses a missing code', () => {
    try {
      recoveryCodeDropsOtherAdmissions({ code: '', recoveryCodeHashes: HASHES });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_missing' });
    }
  });

  it('refuses a spent code', () => {
    try {
      recoveryCodeDropsOtherAdmissions({ code: CODE, recoveryCodeHashes: [] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_spent' });
    }
  });

  it('allows a remaining code without inventing a session', () => {
    expect(() => recoveryCodeDropsOtherAdmissions({ code: CODE, recoveryCodeHashes: HASHES })).not.toThrow();
  });

  it('source keeps the recovered admission door; not a streams redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'recovery-drop-other-admissions.ts'), 'utf8');
    expect(src).toMatch(/recoveryCodeDropsOtherAdmissions/);
    expect(src).toMatch(/auth.recovery_missing/);
    expect(src).toMatch(/auth.recovery_spent/);
    expect(src).not.toMatch(/recoveryCodeDropsOtherStreams/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
