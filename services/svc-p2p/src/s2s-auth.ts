/**
 * Inbound S2S HMAC for p2p internal GETs.
 *
 * Bytes must be retained (`retainRawBody`) or a v2 digest cannot be checked
 * against the wire. GETs bind the empty body.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  DEFAULT_SERVICE_BODY_BIND_MODE,
  rawBodyOf,
  retainRawBody,
  verifyServiceHeaders,
  type ServiceBodyBindMode,
} from '@intafaced/contracts';

export function installP2pS2sRawBody(app: FastifyInstance): void {
  retainRawBody(app);
}

export function p2pInternalServiceOf(
  req: FastifyRequest,
  secret: string,
  mode: ServiceBodyBindMode = DEFAULT_SERVICE_BODY_BIND_MODE,
): string | null {
  return verifyServiceHeaders(req.headers, secret, { rawBody: rawBodyOf(req), mode }).service;
}
