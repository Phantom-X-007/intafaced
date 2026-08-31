/**
 * Open every `/private/stream` only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses assertSessionPasskey. No invented session. No invented challenge.
 * Not a redo of one-stream open or drop-all.
 */
import { assertSessionPasskey } from './session-passkey.js';

export function newlyEnrolledPasskeyOpensAllStreams(body: unknown): void {
  assertSessionPasskey(body);
}
