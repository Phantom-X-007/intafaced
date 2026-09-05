import { AcademyError } from '../errors.js';
import { createHmac, randomUUID } from 'node:crypto';

/**
 * THE STREAM PROVIDER SEAM (§8.3).
 *
 * §8.3 names the v1 ingest as a self-hosted WebRTC SFU "behind a
 * `StreamProvider` interface". This is that interface, and this file is
 * everything this service knows about carrying audio and video: it hands out a
 * join credential for a room, and it tears the room down. Nothing else in
 * svc-academy imports a streaming concept.
 *
 * ── SOCKET §13 · `socket.stream-provider` ───────────────────────────────────
 *
 * There is no SFU in this stack. The honest wiring is therefore a provider that
 * reports it cannot carry a session, in the same shape svc-indexer boots with
 * `NullChainSource` and says `chainSource: "null"` out loud.
 *
 * `NullStreamProvider` REFUSES rather than returning a plausible token. A stub
 * that returned `{ url: 'wss://…', token: 'dev' }` would let a lobby open, let
 * attendees take seats, and fail silently in the browser — which reads to
 * everyone involved as "the platform is broken" rather than "streaming is not
 * configured". The failure is loud, named, and points at the setting that fixes
 * it.
 *
 * Text lobbies still work: seats, presence, capacity and the scene canvas need
 * no provider at all, which is why `join` does not call one.
 */

export interface StreamCredential {
  /** Where the client connects. */
  url: string;
  /** Short-lived, per user, per session. Never logged. */
  token: string;
  expiresAt: Date;
}

export interface StreamProvider {
  /** Identifies the implementation in `/ready` and on spans. */
  readonly id: string;
  /** Create (or reuse) the provider-side room for a session. Returns its id. */
  openRoom(sessionId: string): Promise<string>;
  /** A join credential for one user in one session. */
  credential(input: {
    sessionId: string;
    streamRoom: string;
    userId: string;
    role: 'host' | 'speaker' | 'attendee';
  }): Promise<StreamCredential>;
  closeRoom(streamRoom: string): Promise<void>;
}

export interface LiveKitProviderOptions {
  url: string;
  apiKey: string;
  apiSecret: string;
  tokenTtlSeconds?: number;
  fetch?: typeof globalThis.fetch;
}

type LiveKitGrant = Record<string, boolean | string | number>;

function jwt(apiKey: string, secret: string, subject: string, grant: LiveKitGrant, ttl: number): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: apiKey, sub: subject, iat: now, nbf: now, exp: now + ttl, jti: randomUUID(), video: grant })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** LiveKit's RoomService REST client plus standards-compliant join tokens. */
export class LiveKitStreamProvider implements StreamProvider {
  readonly id = 'livekit';
  private readonly baseUrl: string;
  private readonly request: typeof globalThis.fetch;
  private readonly ttl: number;

  constructor(private readonly options: LiveKitProviderOptions) {
    this.baseUrl = options.url.replace(/^ws/, 'http').replace(/\/$/, '');
    this.request = options.fetch ?? globalThis.fetch;
    this.ttl = options.tokenTtlSeconds ?? 3600;
  }

  private async roomService(path: string, body: object): Promise<Record<string, unknown>> {
    const token = jwt(this.options.apiKey, this.options.apiSecret, this.options.apiKey, { roomCreate: true, roomAdmin: true }, 60);
    const response = await this.request(`${this.baseUrl}/twirp/livekit.RoomService/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new AcademyError(`LiveKit ${path} failed with HTTP ${response.status}`, 'academy.stream_unavailable');
    return (await response.json()) as Record<string, unknown>;
  }

  async openRoom(sessionId: string): Promise<string> {
    const result = await this.roomService('CreateRoom', { name: sessionId });
    return typeof result.name === 'string' && result.name.length > 0 ? result.name : sessionId;
  }

  async credential(input: {
    sessionId: string;
    streamRoom: string;
    userId: string;
    role: 'host' | 'speaker' | 'attendee';
  }): Promise<StreamCredential> {
    const canPublish = input.role !== 'attendee';
    const token = jwt(
      this.options.apiKey,
      this.options.apiSecret,
      input.userId,
      {
        roomJoin: true,
        room: input.streamRoom || input.sessionId,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      },
      this.ttl,
    );
    return { url: this.options.url, token, expiresAt: new Date(Date.now() + this.ttl * 1000) };
  }

  async closeRoom(streamRoom: string): Promise<void> {
    await this.roomService('DeleteRoom', { room: streamRoom });
  }
}

export function streamProviderFromEnv(input: {
  provider?: string;
  url?: string;
  apiKey?: string;
  apiSecret?: string;
  tokenTtlSeconds?: number;
  fetch?: typeof globalThis.fetch;
}): StreamProvider {
  if (input.provider !== 'livekit' || !input.url || !input.apiKey || !input.apiSecret) return new NullStreamProvider();
  return new LiveKitStreamProvider({
    url: input.url,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
    tokenTtlSeconds: input.tokenTtlSeconds,
    fetch: input.fetch,
  });
}

/** True when env constructed a non-null provider. Not a RoomService probe. */
export function isConstructed(provider: StreamProvider): boolean {
  return !(provider instanceof NullStreamProvider);
}

/**
 * `/ready` never hits LiveKit RoomService. XP probes NATS at boot; stream
 * construction (URL+keys) is not that. Usable stays false until a probe exists.
 */
export function isProbed(_provider: StreamProvider): boolean {
  return false;
}

/** True only after a probe. Constructed LiveKit is not usable. */
export function isUsable(provider: StreamProvider): boolean {
  return isProbed(provider);
}

export function streamReadyAnswer(
  provider: StreamProvider,
  configured: string | undefined,
): {
  readonly id: string;
  readonly usable: boolean;
  readonly constructed: boolean;
  readonly configured: string | undefined;
  readonly probed: boolean;
} {
  const card = streamProviderBoardCard(provider);
  return {
    id: card.id,
    usable: card.usable,
    constructed: card.constructed,
    configured,
    probed: card.probed,
  };
}

export class NullStreamProvider implements StreamProvider {
  readonly id = 'null';

  async openRoom(): Promise<string> {
    throw new AcademyError(
      'No streaming provider is configured — set ACADEMY_STREAM_PROVIDER and its URL (SOCKET §13 socket.stream-provider)',
      'academy.stream_unavailable',
    );
  }

  async credential(): Promise<StreamCredential> {
    throw new AcademyError(
      'No streaming provider is configured — this lobby can run as text and presence only (SOCKET §13 socket.stream-provider)',
      'academy.stream_unavailable',
    );
  }

  async closeRoom(): Promise<void> {
    // Closing a room that was never opened is not a failure. Refusing here
    // would make ending a text-only session throw on the way out.
  }
}

/** L3 — stream provider board card (constructed ≠ usable). */
export function streamProviderBoardCard(provider: StreamProvider): {
  readonly id: string;
  readonly usable: boolean;
  readonly constructed: boolean;
  readonly probed: boolean;
  readonly isNull: boolean;
} {
  return {
    id: provider.id,
    usable: isUsable(provider),
    constructed: isConstructed(provider),
    probed: isProbed(provider),
    isNull: provider instanceof NullStreamProvider,
  };
}

/** L3 — status line. */
export function streamProviderStatusLine(provider: StreamProvider): string {
  const c = streamProviderBoardCard(provider);
  return `id=${c.id} usable=${c.usable ? '1' : '0'} constructed=${c.constructed ? '1' : '0'} probed=${c.probed ? '1' : '0'} null=${c.isNull ? '1' : '0'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseStreamProviderStatusLine(line: string): {
  readonly id: string;
  readonly usable: boolean;
  readonly constructed: boolean;
  readonly probed: boolean;
  readonly isNull: boolean;
} | null {
  const m = line.trim().match(/^id=(\S+) usable=([01]) constructed=([01]) probed=([01]) null=([01])$/);
  if (!m) return null;
  return {
    id: m[1]!,
    usable: m[2] === '1',
    constructed: m[3] === '1',
    probed: m[4] === '1',
    isNull: m[5] === '1',
  };
}

/** L3 — true when status matches provider. */
export function streamProviderStatusLineMatches(provider: StreamProvider): boolean {
  const p = parseStreamProviderStatusLine(streamProviderStatusLine(provider));
  if (!p) return false;
  const c = streamProviderBoardCard(provider);
  return p.id === c.id && p.usable === c.usable && p.constructed === c.constructed && p.probed === c.probed && p.isNull === c.isNull;
}

/** L3 — unprobed is never usable; null is never constructed. */
export function streamProviderStatusLineConsistent(line: string): boolean {
  const p = parseStreamProviderStatusLine(line);
  if (!p) return false;
  if (p.isNull && (p.constructed || p.usable || p.probed)) return false;
  if (!p.probed && p.usable) return false;
  return true;
}

/** L3 — export header. */
export function streamProviderExportHeader(): string {
  return 'id,usable,constructed,probed,isNull';
}

/** L3 — export line. */
export function streamProviderExportLine(provider: StreamProvider): string {
  const c = streamProviderBoardCard(provider);
  return `${c.id},${c.usable ? '1' : '0'},${c.constructed ? '1' : '0'},${c.probed ? '1' : '0'},${c.isNull ? '1' : '0'}`;
}

/** L3 — full export. */
export function streamProviderExportText(provider: StreamProvider): string {
  return [streamProviderExportHeader(), streamProviderExportLine(provider)].join('\n');
}

/** L3 — true when provider is null socket (honest unconfigured). */
export function isNullStreamProvider(provider: StreamProvider): boolean {
  return provider instanceof NullStreamProvider;
}
