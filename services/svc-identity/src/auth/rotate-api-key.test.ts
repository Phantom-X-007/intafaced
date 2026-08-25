import { describe, expect, it } from 'vitest';
import { PlaceDoor } from './place-door.js';
import { rotateApiKey, RotateApiKeyError } from './rotate-api-key.js';
import type { ApiKeyMinter } from './mint-api-key-ip.js';

function fakeSql(queue: unknown[][]) {
  let i = 0;
  const fn = async () => {
    const rows = queue[i] ?? [];
    i += 1;
    return rows;
  };
  return fn as unknown as Parameters<typeof rotateApiKey>[1];
}

function makeMinter(opts?: { revokeOld: boolean }) {
  const created: unknown[] = [];
  const revoked: string[] = [];
  const minter: ApiKeyMinter = {
    async createApiKey(input) {
      created.push(input);
      return { id: 'k1', key: 'ifk_live_secret', prefix: 'ifk_live', mode: input.mode ?? 'live' };
    },
    async revokeApiKey(_userId, keyId) {
      revoked.push(keyId);
      if (keyId === 'old' && opts?.revokeOld === false) return false;
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
};

describe('rotateApiKey', () => {
  it('refuses a missing key and does not mint', async () => {
    const { minter, created } = makeMinter();
    await expect(
      rotateApiKey(minter, fakeSql([[]]), { userId: 'u', keyId: 'old', grantorScopes: ['identity:read'] }),
    ).rejects.toMatchObject({ code: 'auth.not_found' });
    expect(created).toEqual([]);
  });

  it('revokes the old key so it cannot place; the new key can', async () => {
    const { minter, created, revoked } = makeMinter();
    const out = await rotateApiKey(minter, fakeSql([[oldRow]]), {
      userId: 'u',
      keyId: 'old',
      grantorScopes: ['identity:read'],
    });
    expect(out).toEqual({
      id: 'k1',
      key: 'ifk_live_secret',
      prefix: 'ifk_live',
      mode: 'live',
      revokedKeyId: 'old',
    });
    expect(created).toHaveLength(1);
    expect(revoked).toEqual(['old']);

    const oldDoor = new PlaceDoor(fakeSql([[{ id: 'old', user_id: 'u', revoked: true }]]) as never);
    const newDoor = new PlaceDoor(fakeSql([[{ id: 'k1', user_id: 'u', revoked: false }]]) as never);
    await expect(oldDoor.assertApiKeyLive('old')).rejects.toMatchObject({ code: 'auth.api_key_revoked' });
    await expect(newDoor.assertApiKeyLive('k1')).resolves.toEqual({ id: 'k1', userId: 'u' });
  });

  it('revokes the new key if the old key cannot be revoked', async () => {
    const { minter, revoked } = makeMinter({ revokeOld: false });
    await expect(
      rotateApiKey(minter, fakeSql([[oldRow]]), { userId: 'u', keyId: 'old', grantorScopes: ['identity:read'] }),
    ).rejects.toBeInstanceOf(RotateApiKeyError);
    expect(revoked).toEqual(['old', 'k1']);
  });
});
