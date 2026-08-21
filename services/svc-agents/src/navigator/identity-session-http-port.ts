/**
 * Live navigator session from svc-identity S2S
 * (`GET /internal/agents/navigator-session/:sessionId`).
 *
 * Unset IDENTITY_URL = honest incomplete_session / no_live_session. 503 body =
 * null — never an invented session row.
 */

import { serviceAuthHeaders } from '@intafaced/contracts';
import type { SessionFixture } from './data-tools.js';
import type { NavigatorIdentitySessionPort } from './identity-session-port.js';

export const IDENTITY_NAVIGATOR_SESSION_PATH = '/internal/agents/navigator-session' as const;

export type HttpNavigatorIdentitySessionOptions = {
  readonly identityUrl: string;
  readonly internalSecret: string;
  readonly fetchImpl?: typeof fetch;
};

type SessionBody =
  | {
      readonly ok: true;
      readonly session: { readonly sessionId: string; readonly userId: string; readonly status: 'open' | 'closed' };
    }
  | { readonly ok: false; readonly reason: string };

function parseSession(raw: unknown): SessionFixture | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as SessionBody;
  if (body.ok !== true || body.session === null || typeof body.session !== 'object') return null;
  const row = body.session;
  if (!row.sessionId?.trim() || !row.userId?.trim()) return null;
  if (row.status !== 'open' && row.status !== 'closed') return null;
  return { sessionId: row.sessionId, userId: row.userId, status: row.status };
}

export function createHttpNavigatorIdentitySessionPort(options: HttpNavigatorIdentitySessionOptions): NavigatorIdentitySessionPort {
  const identityUrl = options.identityUrl.replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async read(sessionId) {
      let response: Response;
      try {
        response = await fetchImpl(`${identityUrl}${IDENTITY_NAVIGATOR_SESSION_PATH}/${encodeURIComponent(sessionId)}`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            ...serviceAuthHeaders('svc-agents', options.internalSecret),
          },
        });
      } catch {
        return null;
      }
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      return parseSession(body);
    },
  };
}
