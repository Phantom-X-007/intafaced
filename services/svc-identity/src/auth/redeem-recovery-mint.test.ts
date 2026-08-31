import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ApiKeyMinter } from './mint-api-key-ip.js';
import { hashToken } from './passwords.js';
import { mintApiKeyAfterRecoveryCode, recoveryCodeMintsApiKey } from './redeem-recovery-mint.js';

function makeMinter() {
  const created: unknown[] = [];
  const minter: ApiKeyMinter = {
    async createApiKey(input) {
      created.push(input);
      return { id: 'k1', key: 'ifk_live_secret', prefix: 'ifk_live', mode: input.mode ?? 'live' };
    },
    async revokeApiKey() {
      return true;
    },
  };
  return { minter, created };
}

function fakeSql(row: { recovery_code_hashes: unknown } | null, session?: { id: string; user_id: string; revoked: boolean }) {
  const bag = { updates: [] as unknown[], sessionReads: 0 };
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').toLowerCase();
    if (text.includes('select') && text.includes('recovery_code_hashes')) {
      if (!row) return [];
      return [row];
    }
    if (text.includes('from sessions')) {
      bag.sessionReads += 1;
      if (!session) return [];
      return [
        {
          id: session.id,
          user_id: session.user_id,
          revoked: session.revoked,
          expires_at: new Date(Date.now() + 60_000),
        },
      ];
    }
    if (text.includes('update') && text.includes('recovery_code_hashes')) {
      bag.updates.push(values);
      return [];
    }
    throw new Error(`unexpected sql: ${text}`);
  };
  return Object.assign(fn, {
    json: (value: unknown) => value,
    bag,
  }) as unknown as Parameters<typeof mintApiKeyAfterRecoveryCode>[1] & {
    bag: { updates: unknown[]; sessionReads: number };
  };
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CODE = 'A1B2C-D3E4F';
const OTHER = 'FFFFF-00000';
const live = { id: 'live-1', user_id: A, revoked: false };
const mintInput = {
  userId: A,
  sessionId: 'live-1',
  code: CODE,
  name: 'desk',
  scopes: ['identity:read'],
  grantorScopes: ['identity:read', 'identity:write'] as const,
};

describe('recoveryCodeMintsApiKey', () => {
  it('refuses a missing code', () => {
    try {
      recoveryCodeMintsApiKey('');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_missing' });
    }
  });

  it('allows a presented code without inventing a session', () => {
    expect(() => recoveryCodeMintsApiKey(CODE)).not.toThrow();
  });
});

describe('mintApiKeyAfterRecoveryCode', () => {
  it('refuses a missing code and does not mint or burn', async () => {
    const sql = fakeSql({ recovery_code_hashes: [hashToken(CODE)] }, live);
    const { minter, created } = makeMinter();
    await expect(mintApiKeyAfterRecoveryCode(minter, sql, { ...mintInput, code: '' })).rejects.toMatchObject({
      code: 'auth.recovery_missing',
    });
    expect(created).toEqual([]);
    expect(sql.bag.sessionReads).toBe(0);
    expect(sql.bag.updates).toEqual([]);
  });

  it('refuses a spent code and does not mint', async () => {
    const sql = fakeSql({ recovery_code_hashes: [] }, live);
    const { minter, created } = makeMinter();
    await expect(mintApiKeyAfterRecoveryCode(minter, sql, mintInput)).rejects.toMatchObject({
      code: 'auth.recovery_spent',
    });
    expect(created).toEqual([]);
    expect(sql.bag.sessionReads).toBe(0);
    expect(sql.bag.updates).toEqual([]);
  });

  it('refuses a wrong code and does not mint or burn', async () => {
    const sql = fakeSql({ recovery_code_hashes: [hashToken(OTHER)] }, live);
    const { minter, created } = makeMinter();
    await expect(mintApiKeyAfterRecoveryCode(minter, sql, mintInput)).rejects.toMatchObject({
      code: 'auth.recovery_invalid',
    });
    expect(created).toEqual([]);
    expect(sql.bag.updates).toEqual([]);
  });

  it('redeems a matching code, mints from the recovered session, and burns the hash', async () => {
    const leftover = hashToken(OTHER);
    const sql = fakeSql({ recovery_code_hashes: [hashToken(CODE), leftover] }, live);
    const { minter, created } = makeMinter();
    await expect(mintApiKeyAfterRecoveryCode(minter, sql, mintInput)).resolves.toEqual({
      id: 'k1',
      key: 'ifk_live_secret',
      prefix: 'ifk_live',
      mode: 'live',
      sessionId: 'live-1',
    });
    expect(created).toHaveLength(1);
    expect(sql.bag.sessionReads).toBe(1);
    expect(sql.bag.updates).toHaveLength(1);
    const written = sql.bag.updates[0] as unknown[];
    expect(written).toContainEqual([leftover]);
  });

  it('does not invent a session when the recovered one is missing', async () => {
    const sql = fakeSql({ recovery_code_hashes: [hashToken(CODE)] });
    const { minter, created } = makeMinter();
    await expect(mintApiKeyAfterRecoveryCode(minter, sql, mintInput)).rejects.toMatchObject({
      code: 'auth.session_denied',
    });
    expect(created).toEqual([]);
    expect(sql.bag.sessionReads).toBe(1);
    expect(sql.bag.updates).toEqual([]);
  });

  it('treats a missing user as not found', async () => {
    const sql = fakeSql(null, live);
    const { minter, created } = makeMinter();
    await expect(mintApiKeyAfterRecoveryCode(minter, sql, mintInput)).rejects.toMatchObject({
      code: 'auth.not_found',
    });
    expect(created).toEqual([]);
  });

  it('source reuses hashToken and PlaceDoor; not a keys-revoke redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'redeem-recovery-mint.ts'), 'utf8');
    expect(src).toMatch(/hashToken/);
    expect(src).toMatch(/PlaceDoor/);
    expect(src).toMatch(/assertSessionLive/);
    expect(src).toMatch(/createApiKey/);
    expect(src).not.toMatch(/revokeAllApiKeys/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
