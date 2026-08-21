/**
 * Live identity session projection for navigator identity.session.read.
 *
 * Production leave unset: live session reads refuse `no_live_session` —
 * never an invented open session, never a caller fixture as live truth.
 */

import type { SessionFixture } from './data-tools.js';

export type NavigatorIdentitySessionPort = {
  read(sessionId: string): Promise<SessionFixture | null>;
};

export type LiveNavigatorSession =
  { readonly ok: true; readonly session: SessionFixture } | { readonly ok: false; readonly reason: 'no_live_session' };

export async function readLiveNavigatorSession(
  port: NavigatorIdentitySessionPort | undefined,
  sessionId: string,
  requesterUserId: string,
): Promise<LiveNavigatorSession> {
  if (port === undefined || !sessionId.trim() || !requesterUserId.trim()) {
    return { ok: false, reason: 'no_live_session' };
  }
  try {
    const session = await port.read(sessionId);
    if (session === null || !session.sessionId.trim() || !session.userId.trim()) {
      return { ok: false, reason: 'no_live_session' };
    }
    if (session.userId !== requesterUserId) {
      return { ok: false, reason: 'no_live_session' };
    }
    return { ok: true, session };
  } catch {
    return { ok: false, reason: 'no_live_session' };
  }
}
