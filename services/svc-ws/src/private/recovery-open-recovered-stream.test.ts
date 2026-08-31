import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recoveryCodeOpensRecoveredStream } from './recovery-open-recovered-stream.js';

const CODE = 'A1B2C-D3E4F';
const HASHES = ['hash-1'];

describe('recoveryCodeOpensRecoveredStream', () => {
  it('refuses a missing code', () => {
    try {
      recoveryCodeOpensRecoveredStream({ code: '', recoveryCodeHashes: HASHES });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_missing' });
    }
  });

  it('refuses a spent code', () => {
    try {
      recoveryCodeOpensRecoveredStream({ code: CODE, recoveryCodeHashes: [] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_spent' });
    }
  });

  it('allows a remaining code without inventing a session', () => {
    expect(() => recoveryCodeOpensRecoveredStream({ code: CODE, recoveryCodeHashes: HASHES })).not.toThrow();
  });

  it('source keeps the recovered-session stream door; not a drop-other redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'recovery-open-recovered-stream.ts'), 'utf8');
    expect(src).toMatch(/recoveryCodeOpensRecoveredStream/);
    expect(src).toMatch(/auth.recovery_missing/);
    expect(src).toMatch(/auth.recovery_spent/);
    expect(src).not.toMatch(/recoveryCodeDropsOtherStreams/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
