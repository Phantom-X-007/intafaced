import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recoveryCodeAdmitsRecoveredSession } from './recovery-admit-recovered.js';

const CODE = 'A1B2C-D3E4F';
const HASHES = ['hash-1'];

describe('recoveryCodeAdmitsRecoveredSession', () => {
  it('refuses a missing code', () => {
    try {
      recoveryCodeAdmitsRecoveredSession({ code: '', recoveryCodeHashes: HASHES });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_missing' });
    }
  });

  it('refuses a spent code', () => {
    try {
      recoveryCodeAdmitsRecoveredSession({ code: CODE, recoveryCodeHashes: [] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_spent' });
    }
  });

  it('allows a remaining code without inventing a session', () => {
    expect(() => recoveryCodeAdmitsRecoveredSession({ code: CODE, recoveryCodeHashes: HASHES })).not.toThrow();
  });

  it('source keeps the recovered-session admit door; not a drop-other or stream-open redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'recovery-admit-recovered.ts'), 'utf8');
    expect(src).toMatch(/recoveryCodeAdmitsRecoveredSession/);
    expect(src).toMatch(/auth.recovery_missing/);
    expect(src).toMatch(/auth.recovery_spent/);
    expect(src).not.toMatch(/recoveryCodeDropsOtherAdmissions/);
    expect(src).not.toMatch(/recoveryCodeOpensRecoveredStream/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
