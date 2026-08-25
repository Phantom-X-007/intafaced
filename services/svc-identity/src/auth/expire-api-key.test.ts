import { describe, expect, it } from 'vitest';
import { PlaceDoor } from './place-door.js';
import { apiKeyExpired, expireApiKey, requireExpiresAt } from './expire-api-key.js';

function fakeSql(rows: unknown[] = []) {
  const fn = async () => rows;
  return fn as unknown as Parameters<typeof expireApiKey>[0];
}

const past = new Date('2000-01-01T00:00:00.000Z');
const future = new Date('2099-01-01T00:00:00.000Z');

describe('expireApiKey', () => {
  it('refuses a missing expiresAt and does not write', async () => {
    await expect(expireApiKey(fakeSql(), 'u', 'k', undefined)).rejects.toMatchObject({
      code: 'auth.expires_at_missing',
    });
    await expect(expireApiKey(fakeSql(), 'u', 'k', '')).rejects.toMatchObject({
      code: 'auth.expires_at_missing',
    });
    await expect(requireExpiresAt(null)).toThrow(/expiresAt is required/);
  });

  it('after expiresAt the key cannot place; before it can', async () => {
    const written = await expireApiKey(fakeSql([{ id: 'k', expires_at: past }]), 'u', 'k', past);
    expect(written).toEqual({ id: 'k', expiresAt: past });
    expect(apiKeyExpired(written.expiresAt)).toBe(true);

    const expiredDoor = new PlaceDoor(fakeSql([{ id: 'k', user_id: 'u', revoked: false, expires_at: past }]) as never);
    await expect(expiredDoor.assertApiKeyLive('k')).rejects.toMatchObject({ code: 'auth.api_key_revoked' });

    const liveDoor = new PlaceDoor(fakeSql([{ id: 'k', user_id: 'u', revoked: false, expires_at: future }]) as never);
    await expect(liveDoor.assertApiKeyLive('k')).resolves.toEqual({ id: 'k', userId: 'u' });
  });

  it('treats a missing key as not found', async () => {
    await expect(expireApiKey(fakeSql([]), 'u', 'k', future)).rejects.toMatchObject({ code: 'auth.not_found' });
  });
});
