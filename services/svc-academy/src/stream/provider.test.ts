import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import {
  isUsable,
  isConstructed,
  isProbed,
  NullStreamProvider,
  type StreamProvider,
  streamProviderBoardCard,
  streamProviderStatusLine,
  parseStreamProviderStatusLine,
  streamProviderStatusLineMatches,
  streamProviderStatusLineConsistent,
  streamProviderExportHeader,
  streamProviderExportLine,
  streamProviderExportText,
  streamReadyAnswer,
  isNullStreamProvider,
  LiveKitStreamProvider,
  streamProviderFromEnv,
} from './provider.js';

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
    expect(isConstructed(provider)).toBe(false);
    expect(isProbed(provider)).toBe(false);
  });

  it('does not sell a constructed LiveKit as usable — /ready never hits RoomService', () => {
    const fake: StreamProvider = {
      id: 'livekit',
      openRoom: async () => 'room-1',
      credential: async () => ({ url: 'wss://sfu.example', token: 't', expiresAt: new Date() }),
      closeRoom: async () => undefined,
    };
    expect(isConstructed(fake)).toBe(true);
    expect(isProbed(fake)).toBe(false);
    expect(isUsable(fake)).toBe(false);
  });
});

describe('L3 wave63 stream provider honesty', () => {
  it('null provider boards refuse usable claim', () => {
    const provider = new NullStreamProvider();
    expect(isNullStreamProvider(provider)).toBe(true);
    expect(streamProviderBoardCard(provider).usable).toBe(false);
    expect(streamProviderStatusLineMatches(provider)).toBe(true);
    expect(streamProviderStatusLineConsistent(streamProviderStatusLine(provider))).toBe(true);
    expect(parseStreamProviderStatusLine('nope')).toBeNull();
    expect(streamProviderExportText(provider).startsWith(streamProviderExportHeader())).toBe(true);
    expect(streamProviderExportLine(provider)).toBe('null,0,0,0,1');

    const fake: StreamProvider = {
      id: 'webrtc-dev',
      openRoom: async () => 'r1',
      credential: async () => ({ url: 'wss://x', token: 't', expiresAt: new Date() }),
      closeRoom: async () => {},
    };
    expect(streamProviderBoardCard(fake)).toMatchObject({
      usable: false,
      constructed: true,
      probed: false,
      isNull: false,
    });
    expect(streamProviderStatusLineMatches(fake)).toBe(true);
    expect(streamProviderExportLine(fake)).toBe('webrtc-dev,0,1,0,0');
  });
});

describe('LiveKitStreamProvider', () => {
  it('uses the RoomService HTTP API and signs a real join token', async () => {
    const requests: Array<{ url: string; body: string; authorization: string }> = [];
    const provider = new LiveKitStreamProvider({
      url: 'wss://livekit.example',
      apiKey: 'API123',
      apiSecret: 'secret',
      tokenTtlSeconds: 600,
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: String(init?.body),
          authorization: String(new Headers(init?.headers).get('authorization')),
        });
        return new Response(JSON.stringify({ name: 'session-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    expect(await provider.openRoom('session-1')).toBe('session-1');
    const credential = await provider.credential({ sessionId: 'session-1', streamRoom: 'session-1', userId: 'u1', role: 'speaker' });
    expect(requests[0]).toMatchObject({
      url: 'https://livekit.example/twirp/livekit.RoomService/CreateRoom',
      body: '{"name":"session-1"}',
    });
    expect(requests[0]?.authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
    expect(credential.url).toBe('wss://livekit.example');
    expect(credential.token).toMatch(/^eyJ/);
    const payload = JSON.parse(Buffer.from(credential.token.split('.')[1]!, 'base64url').toString()) as {
      sub: string;
      video: { roomJoin: boolean; room: string; canPublish: boolean };
    };
    expect(payload.sub).toBe('u1');
    expect(payload.video).toMatchObject({ roomJoin: true, room: 'session-1', canPublish: true });
    expect(credential.token).not.toBe('dev');
  });

  it('stays Null when LiveKit credentials are blank', () => {
    expect(streamProviderFromEnv({ provider: 'livekit', url: '', apiKey: '', apiSecret: '' }).id).toBe('null');
  });

  it('URL+keys construct LiveKit but /ready still reports unprobed, not usable', () => {
    const provider = streamProviderFromEnv({
      provider: 'livekit',
      url: 'wss://livekit.example',
      apiKey: 'API123',
      apiSecret: 'secret',
    });
    expect(provider).toBeInstanceOf(LiveKitStreamProvider);
    expect(isConstructed(provider)).toBe(true);
    expect(isProbed(provider)).toBe(false);
    expect(isUsable(provider)).toBe(false);
    expect(streamReadyAnswer(provider, 'livekit')).toEqual({
      id: 'livekit',
      usable: false,
      constructed: true,
      configured: 'livekit',
      probed: false,
    });
    expect(streamReadyAnswer(new NullStreamProvider(), 'none')).toEqual({
      id: 'null',
      usable: false,
      constructed: false,
      configured: 'none',
      probed: false,
    });
  });
});
