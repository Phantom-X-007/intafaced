/**
 * CARD R-auth — session/API-key id on order/fill/ledger or named refuse.
 *
 * PTX-M01-R05. Stamp the signed principal's `sid` (session) and/or `kid`
 * (API key). Never mint a session. Passkey attestation stays in svc-identity.
 */
import type { Principal } from '@intafaced/auth';
import type { PostRequest } from '@intafaced/ledger-client';
import { TradeError } from './types.js';

export const AUTH_ATTRIBUTION_MISSING = 'trade.auth_attribution_missing' as const;

export const AUTH_ATTRIBUTION_MISSING_MESSAGE = 'session or API-key id is required on order/fill/ledger; trade does not invent a session';

/** House MM is a machine credential, not a user session. Not a UUID we mint. */
export const HOUSE_MM_API_KEY_ID = 'house-mm' as const;

export type AuthAttribution = {
  readonly sessionId: string | null;
  readonly apiKeyId: string | null;
};

function readRequired(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function stampAuthAttribution(input: { readonly sessionId?: string | null; readonly apiKeyId?: string | null }): AuthAttribution {
  return {
    sessionId: readRequired(input.sessionId ?? null),
    apiKeyId: readRequired(input.apiKeyId ?? null),
  };
}

export function hasAuthAttribution(stamp: AuthAttribution): boolean {
  return stamp.sessionId !== null || stamp.apiKeyId !== null;
}

export function requireAuthAttribution(stamp: AuthAttribution): AuthAttribution {
  if (!hasAuthAttribution(stamp)) {
    throw new TradeError(AUTH_ATTRIBUTION_MISSING_MESSAGE, AUTH_ATTRIBUTION_MISSING);
  }
  return stamp;
}

export function attributionFromPrincipal(principal: Pick<Principal, 'sid' | 'kid'>): AuthAttribution {
  return requireAuthAttribution(
    stampAuthAttribution({
      sessionId: principal.sid,
      apiKeyId: principal.kid,
    }),
  );
}

export function attributionFromOrder(order: { readonly sessionId?: string | null; readonly apiKeyId?: string | null }): AuthAttribution {
  return requireAuthAttribution(
    stampAuthAttribution({
      sessionId: order.sessionId,
      apiKeyId: order.apiKeyId,
    }),
  );
}

export function houseMmAttribution(): AuthAttribution {
  return requireAuthAttribution(stampAuthAttribution({ sessionId: null, apiKeyId: HOUSE_MM_API_KEY_ID }));
}

export function withLedgerAttribution(post: PostRequest, stamp: AuthAttribution): PostRequest {
  const attributed = requireAuthAttribution(stamp);
  return {
    ...post,
    meta: {
      ...post.meta,
      sessionId: attributed.sessionId,
      apiKeyId: attributed.apiKeyId,
    },
  };
}

export function withFillLedgerAttribution(post: PostRequest, maker: AuthAttribution, taker: AuthAttribution): PostRequest {
  const makerStamp = requireAuthAttribution(maker);
  const takerStamp = requireAuthAttribution(taker);
  return {
    ...post,
    meta: {
      ...post.meta,
      makerSessionId: makerStamp.sessionId,
      makerApiKeyId: makerStamp.apiKeyId,
      takerSessionId: takerStamp.sessionId,
      takerApiKeyId: takerStamp.apiKeyId,
    },
  };
}
