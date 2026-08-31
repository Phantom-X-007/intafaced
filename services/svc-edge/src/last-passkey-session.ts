/**
 * Close the private session when the last enrolled passkey is unenrolled.
 * Refuse if none remain. Reuses assertSessionPasskey. No invented session.
 * No invented challenge.
 */
import { assertSessionPasskey } from './session-passkey.js';

export function lastPasskeyUnenrollClosesSession(body: unknown): void {
  assertSessionPasskey(body);
}
