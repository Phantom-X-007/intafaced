import { describe, expect, it } from 'vitest';
import { PlaceDoor } from './place-door.js';
import { expireSession, requireSessionExpiresAt, sessionExpired } from './expire-session.js';

function fakeSql(rows: unknown[] = []) {
  const fn = async () => rows;
  return fn as unknown as Parameters<typeof expireSession>[0];
}

const past = new Date('2000-01-01T00:00:00.000Z');
const future = new Date('2099-01-01T00:00:00.000Z');

describe('expireSession', () => {
  it('refuses a missing expiresAt and does not write', async () => {
    await expect(expireSession(fakeSql(), 'u', 's', undefined)).rejects.toMatchObject({
      code: 'auth.expires_at_missing',
    });
    await expect(expireSession(fakeSql(), 'u', 's', '')).rejects.toMatchObject({
      code: 'auth.expires_at_missing',
    });
    await expect(requireSessionExpiresAt(null)).toThrow(/expiresAt is required/);
  });

  it('after expiresAt the session cannot place; before it can', async () => {
    const written = await expireSession(fakeSql([{ id: 's', expires_at: past }]), 'u', 's', past);
    expect(written).toEqual({ id: 's', expiresAt: past });
    expect(sessionExpired(written.expiresAt)).toBe(true);

    const expiredDoor = new PlaceDoor(
      fakeSql([{ id: 's', user_id: 'u', revoked: false, expires_at: past }]) as never,
    );
    await expect(expiredDoor.assertSessionLive('s')).rejects.toMatchObject({ code: 'auth.session_revoked' });

    const liveDoor = new PlaceDoor(
      fakeSql([{ id: 's', user_id: 'u', revoked: false, expires_at: future }]) as never,
    );
    await expect(liveDoor.assertSessionLive('s')).resolves.toEqual({ id: 's', userId: 'u' });
  });

  it('treats a missing session as not found', async () => {
    await expect(expireSession(fakeSql([]), 'u', 's', future)).rejects.toMatchObject({ code: 'auth.not_found' });
  });
});
