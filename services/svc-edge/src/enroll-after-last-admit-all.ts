/**
 * Admit every private request only after the newly enrolled passkey verifies following a last-unenroll.
 * Refuse if none remain. Reuses assertSessionPasskey. No invented session. No invented challenge.
 * Not a redo of one-request admit.
 */
import { assertSessionPasskey } from './session-passkey.js';

export function newlyEnrolledPasskeyAdmitsAllRequests(body: unknown): void {
  assertSessionPasskey(body);
}
