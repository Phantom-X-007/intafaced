import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recoveryCodeDropsOtherDropCopyStreams } from './recovery-drop-other-streams.js';

const CODE = 'A1B2C-D3E4F';
const HASHES = ['hash-1'];

describe('recoveryCodeDropsOtherDropCopyStreams', () => {
  it('refuses a missing code', () => {
    try {
      recoveryCodeDropsOtherDropCopyStreams({ code: '', recoveryCodeHashes: HASHES });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_missing' });
    }
  });

  it('refuses a spent code', () => {
    try {
      recoveryCodeDropsOtherDropCopyStreams({ code: CODE, recoveryCodeHashes: [] });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_spent' });
    }
  });

  it('allows a remaining code without inventing a session', () => {
    expect(() => recoveryCodeDropsOtherDropCopyStreams({ code: CODE, recoveryCodeHashes: HASHES })).not.toThrow();
  });

  it('source keeps the recovered drop-copy door; not a private-stream or key-revoke redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'recovery-drop-other-streams.ts'), 'utf8');
    expect(src).toMatch(/recoveryCodeDropsOtherDropCopyStreams/);
    expect(src).toMatch(/auth.recovery_missing/);
    expect(src).toMatch(/auth.recovery_spent/);
    expect(src).not.toMatch(/PRIVATE_STREAM_PATH/);
    expect(src).not.toMatch(/recoveredMintKeyRevokeDropsDropCopyStream/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
