import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ApiKeyMinter } from './mint-api-key-ip.js';
import { hashToken } from './passwords.js';
import { PlaceDoor } from './place-door.js';
import { rotateApiKeyAfterRecoveryCode, recoveryCodeRotatesApiKey } from './redeem-recovery-rotate.js';

function makeMinter() {
  const created: unknown[] = [];
  const revoked: string[] = [];
  const minter: ApiKeyMinter = {
    async createApiKey(input) {
      created.push(input);
      return { id: 'k1', key: 'ifk_live_secret', prefix: 'ifk_live', mode: input.mode ?? 'live' };
    },
    async revokeApiKey(_userId, keyId) {
      revoked.push(keyId);
      return true;
    },
  };
  return { minter, created, revoked };
}

const oldRow = {
  id: 'old',
  name: 'desk',
  scopes: ['identity:read'],
  domain_whitelist: [],
  expires_at: null,
  mode: 'live',
  ip_allowlist: [],
  account_id: null,
};

function fakeSql(
  row: { recovery_code_hashes: unknown } | null,
  session?: { id: string; user_id: string; revoked: boolean },
  keyRows: unknown[] = [oldRow],
) {
  const bag = { updates: [] as unknown[], sessionReads: 0, keyReads: 0 };
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
    if (text.includes('from api_keys')) {
      bag.keyReads += 1;
      return keyRows;
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
  }) as unknown as Parameters<typeof rotateApiKeyAfterRecoveryCode>[1] & {
    bag: { updates: unknown[]; sessionReads: number; keyReads: number };
  };
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CODE = 'A1B2C-D3E4F';
const OTHER = 'FFFFF-00000';
const live = { id: 'live-1', user_id: A, revoked: false };
const rotateInput = {
  userId: A,
  sessionId: 'live-1',
  keyId: 'old',
  code: CODE,
  grantorScopes: ['identity:read'] as const,
};

describe('recoveryCodeRotatesApiKey', () => {
  it('refuses a missing code', () => {
    try {
      recoveryCodeRotatesApiKey('');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.recovery_missing' });
    }
  });
});

describe('rotateApiKeyAfterRecoveryCode', () => {
  it('refuses a missing code and does not rotate or burn', async () => {
    const sql = fakeSql({ recovery_code_hashes: [hashToken(CODE)] }, live);
    const { minter, created, revoked } = makeMinter();
    await expect(rotateApiKeyAfterRecoveryCode(minter, sql, { ...rotateInput, code: '' })).rejects.toMatchObject({
      code: 'auth.recovery_missing',
    });
    expect(created).toEqual([]);
    expect(revoked).toEqual([]);
    expect(sql.bag.sessionReads).toBe(0);
    expect(sql.bag.updates).toEqual([]);
  });

  it('refuses a spent code and does not rotate', async () => {
    const sql = fakeSql({ recovery_code_hashes: [] }, live);
    const { minter, created, revoked } = makeMinter();
    await expect(rotateApiKeyAfterRecoveryCode(minter, sql, rotateInput)).rejects.toMatchObject({
      code: 'auth.recovery_spent',
    });
    expect(created).toEqual([]);
    expect(revoked).toEqual([]);
  });

  it('redeems a matching code, rotates from the recovered session, and the old key cannot place', async () => {
    const leftover = hashToken(OTHER);
    const sql = fakeSql({ recovery_code_hashes: [hashToken(CODE), leftover] }, live);
    const { minter, created, revoked } = makeMinter();
    await expect(rotateApiKeyAfterRecoveryCode(minter, sql, rotateInput)).resolves.toEqual({
      id: 'k1',
      key: 'ifk_live_secret',
      prefix: 'ifk_live',
      mode: 'live',
      revokedKeyId: 'old',
      sessionId: 'live-1',
    });
    expect(created).toHaveLength(1);
    expect(revoked).toEqual(['old']);
    expect(sql.bag.sessionReads).toBe(1);
    expect(sql.bag.keyReads).toBe(1);
    expect(sql.bag.updates).toHaveLength(1);
    const written = sql.bag.updates[0] as unknown[];
    expect(written).toContainEqual([leftover]);

    const oldDoor = new PlaceDoor(fakeSql(null, undefined, [{ id: 'old', user_id: A, revoked: true }]) as never);
    const newDoor = new PlaceDoor(fakeSql(null, undefined, [{ id: 'k1', user_id: A, revoked: false }]) as never);
    await expect(oldDoor.assertApiKeyLive('old')).rejects.toMatchObject({ code: 'auth.api_key_revoked' });
    await expect(newDoor.assertApiKeyLive('k1')).resolves.toEqual({ id: 'k1', userId: A });
  });

  it('does not invent a session when the recovered one is missing', async () => {
    const sql = fakeSql({ recovery_code_hashes: [hashToken(CODE)] });
    const { minter, created, revoked } = makeMinter();
    await expect(rotateApiKeyAfterRecoveryCode(minter, sql, rotateInput)).rejects.toMatchObject({
      code: 'auth.session_denied',
    });
    expect(created).toEqual([]);
    expect(revoked).toEqual([]);
    expect(sql.bag.updates).toEqual([]);
  });

  it('treats a missing user as not found', async () => {
    const sql = fakeSql(null, live);
    const { minter, created } = makeMinter();
    await expect(rotateApiKeyAfterRecoveryCode(minter, sql, rotateInput)).rejects.toMatchObject({
      code: 'auth.not_found',
    });
    expect(created).toEqual([]);
  });

  it('source reuses hashToken, PlaceDoor, and rotateApiKey; not a mint redo', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'redeem-recovery-rotate.ts'), 'utf8');
    expect(src).toMatch(/hashToken/);
    expect(src).toMatch(/PlaceDoor/);
    expect(src).toMatch(/assertSessionLive/);
    expect(src).toMatch(/rotateApiKey/);
    expect(src).not.toMatch(/mintApiKeyAfterRecoveryCode/);
    expect(src).not.toMatch(/generateAuthenticationOptions/);
    expect(src).not.toMatch(/INSERT\s+sessions/i);
  });
});
