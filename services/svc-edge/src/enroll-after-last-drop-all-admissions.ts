/**
 * Drop every private admission only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses assertSessionPasskey. No invented session. No invented challenge.
 * Not a redo of admit-all.
 */
import { assertSessionPasskey } from './session-passkey.js';

export function newlyEnrolledPasskeyDropsAllAdmissions(body: unknown): void {
  assertSessionPasskey(body);
}
