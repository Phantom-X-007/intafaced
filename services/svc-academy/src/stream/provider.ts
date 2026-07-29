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
  credential(input: { sessionId: string; streamRoom: string; userId: string; role: 'host' | 'speaker' | 'attendee' }): Promise<StreamCredential>;
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
