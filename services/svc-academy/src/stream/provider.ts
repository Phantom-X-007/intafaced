import { AcademyError } from '../errors.js';

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

/** True when a provider can actually carry a session. */
export function isUsable(provider: StreamProvider): boolean {
  return !(provider instanceof NullStreamProvider);
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

/** L3 — stream provider board card (usable honesty). */
export function streamProviderBoardCard(provider: StreamProvider): {
  readonly id: string;
  readonly usable: boolean;
  readonly isNull: boolean;
} {
  return {
    id: provider.id,
    usable: isUsable(provider),
    isNull: provider instanceof NullStreamProvider,
  };
}

/** L3 — status line. */
export function streamProviderStatusLine(provider: StreamProvider): string {
  const c = streamProviderBoardCard(provider);
  return `id=${c.id} usable=${c.usable ? '1' : '0'} null=${c.isNull ? '1' : '0'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseStreamProviderStatusLine(
  line: string,
): { readonly id: string; readonly usable: boolean; readonly isNull: boolean } | null {
  const m = line.trim().match(/^id=(\S+) usable=([01]) null=([01])$/);
  if (!m) return null;
  return { id: m[1]!, usable: m[2] === '1', isNull: m[3] === '1' };
}

/** L3 — true when status matches provider. */
export function streamProviderStatusLineMatches(provider: StreamProvider): boolean {
  const p = parseStreamProviderStatusLine(streamProviderStatusLine(provider));
  if (!p) return false;
  const c = streamProviderBoardCard(provider);
  return p.id === c.id && p.usable === c.usable && p.isNull === c.isNull;
}

/** L3 — true when null implies not usable. */
export function streamProviderStatusLineConsistent(line: string): boolean {
  const p = parseStreamProviderStatusLine(line);
  if (!p) return false;
  if (p.isNull) return p.usable === false;
  return true;
}

/** L3 — export header. */
export function streamProviderExportHeader(): string {
  return 'id,usable,isNull';
}

/** L3 — export line. */
export function streamProviderExportLine(provider: StreamProvider): string {
  const c = streamProviderBoardCard(provider);
  return `${c.id},${c.usable ? '1' : '0'},${c.isNull ? '1' : '0'}`;
}

/** L3 — full export. */
export function streamProviderExportText(provider: StreamProvider): string {
  return [streamProviderExportHeader(), streamProviderExportLine(provider)].join('\n');
}

/** L3 — true when provider is null socket (honest unconfigured). */
export function isNullStreamProvider(provider: StreamProvider): boolean {
  return provider instanceof NullStreamProvider;
}
