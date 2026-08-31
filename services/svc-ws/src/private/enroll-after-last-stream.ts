/**
 * Drop `/private/stream` only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses assertSessionPasskey. No invented session. No invented challenge.
 */
import { assertSessionPasskey } from './session-passkey.js';

export function newlyEnrolledPasskeyDropsStream(body: unknown): void {
  assertSessionPasskey(body);
}
