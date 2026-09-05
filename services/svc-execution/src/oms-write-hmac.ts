/**
 * Inbound HMAC mill for OMS order-like writes (startBasket / kill / place children).
 * Matching already requires HMAC as svc-execution on child POST/DELETE.
 * Session admin:write is not a service caller — refuse-closed.
 */
import { TRPCError } from '@trpc/server';
import { ServiceAuthError, requireServiceCaller, verifyServiceHeaders, type ServiceRawBody } from '@intafaced/contracts';

export const OMS_WRITE_CALLER = 'svc-execution' as const;
export const OMS_WRITE_SECRET_ENV = 'INTERNAL_SERVICE_SECRET';
const MIN_SECRET_LENGTH = 32;

export type OmsWriteHmacOk = { readonly ok: true; readonly service: typeof OMS_WRITE_CALLER };
export type OmsWriteHmacRefuse = {
  readonly ok: false;
  readonly status: 401 | 403;
  readonly body: { readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' };
};

export function readOmsWriteSecret(explicit?: string | null): string | undefined {
  const fromDep = explicit?.trim() ?? '';
  if (fromDep.length >= MIN_SECRET_LENGTH) return fromDep;
  const fromEnv = process.env[OMS_WRITE_SECRET_ENV]?.trim() ?? '';
  return fromEnv.length >= MIN_SECRET_LENGTH ? fromEnv : undefined;
}

/** Unsigned → 401. Wrong HMAC caller (svc-trade) → 403. Only svc-execution writes. */
export function authorizeOmsWriteHmac(
  headers: Record<string, string | string[] | undefined>,
  secret: string | undefined,
  rawBody: ServiceRawBody = { retained: false },
): OmsWriteHmacOk | OmsWriteHmacRefuse {
  const trimmed = secret?.trim() ?? '';
  if (trimmed.length < MIN_SECRET_LENGTH) {
    return { ok: false, status: 401, body: { code: 'UNAUTHORIZED' } };
  }
  try {
    let verification = verifyServiceHeaders(headers, trimmed, { rawBody, mode: 'require' });
    if (!verification.service && (verification.rejected === 'missing-body-digest' || verification.rejected === 'body-unavailable')) {
      verification = verifyServiceHeaders(headers, trimmed, { rawBody, mode: 'accept-both' });
    }
    if (!verification.service) {
      return { ok: false, status: 401, body: { code: 'UNAUTHORIZED' } };
    }
    if (verification.service !== OMS_WRITE_CALLER) {
      return { ok: false, status: 403, body: { code: 'FORBIDDEN' } };
    }
    return { ok: true, service: OMS_WRITE_CALLER };
  } catch (err) {
    if (err instanceof ServiceAuthError) {
      return { ok: false, status: 401, body: { code: 'UNAUTHORIZED' } };
    }
    throw err;
  }
}

export function requireOmsWriteService(service: string | null): asserts service is typeof OMS_WRITE_CALLER {
  requireServiceCaller(service);
  if (service !== OMS_WRITE_CALLER) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'OMS writes are callable only as svc-execution',
    });
  }
}
