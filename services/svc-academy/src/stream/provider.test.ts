import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import { isUsable, NullStreamProvider, type StreamProvider } from './provider.js';

/**
 * THE SFU IS NOT IN THIS STACK, AND THIS SUITE IS WHY THAT IS SAFE.
 *
 * §8.3 names LiveKit as the v1 ingest, self-hosted, behind a `StreamProvider`
 * interface. There is no LiveKit deployment here and no API key for one, so the
 * only honest implementation is one that refuses.
 *
 * The failure this guards against is specific and it is worse than an outage: a
 * provider that returned `{ url: 'wss://…', token: 'dev' }` would let a lobby
 * open, let attendees take seats, and then fail silently in every browser. To
 * the user that reads as "the platform is broken". To an operator watching
 * `/health` it reads as nothing at all, because every container is up.
 *
 * So the test is not "does Null throw" — it is "can a fabricated credential
 * ever leave this module". That is the property that must survive somebody
 * later adding a real provider next to this one.
 */

describe('NullStreamProvider — refuses rather than fabricates', () => {
  const provider = new NullStreamProvider();

  it('refuses to open a room, and names the setting that would fix it', async () => {
    await expect(provider.openRoom()).rejects.toBeInstanceOf(AcademyError);
    await expect(provider.openRoom()).rejects.toMatchObject({ code: 'academy.stream_unavailable' });
    await expect(provider.openRoom()).rejects.toThrow(/ACADEMY_STREAM_PROVIDER/);
  });

  it('never returns a join credential — the whole point', async () => {
    await expect(provider.credential()).rejects.toMatchObject({ code: 'academy.stream_unavailable' });
  });

  it('says a lobby still runs as text when it refuses a credential', async () => {
    // The message is load-bearing: it is the difference between a user
    // concluding the platform is broken and a user joining a text lobby.
    await expect(provider.credential()).rejects.toThrow(/text and presence/);
  });

  it('closes a room that was never opened without complaining', async () => {
    // Ending a text-only session must not throw on the way out. `endSession`
    // calls this unconditionally when a session carries a stream_room, and a
    // refusal here would strand attendees in a session nobody can close.
    await expect(provider.closeRoom()).resolves.toBeUndefined();
  });

  it('reports itself as unusable, so callers can branch before they call', () => {
    expect(provider.id).toBe('null');
    expect(isUsable(provider)).toBe(false);
  });

  it('treats any non-null provider as usable', () => {
    const fake: StreamProvider = {
      id: 'livekit',
      openRoom: async () => 'room-1',
      credential: async () => ({ url: 'wss://sfu.example', token: 't', expiresAt: new Date() }),
      closeRoom: async () => undefined,
    };
    expect(isUsable(fake)).toBe(true);
  });
});
