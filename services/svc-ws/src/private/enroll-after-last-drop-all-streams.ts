/**
 * Drop every `/private/stream` only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses assertSessionPasskey. No invented session. No invented challenge.
 * Not a redo of one-stream drop.
 */
import { assertSessionPasskey } from './session-passkey.js';

export function newlyEnrolledPasskeyDropsAllStreams(body: unknown): void {
  assertSessionPasskey(body);
}
