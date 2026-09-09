/**
 * GET /internal/curriculum — service-to-service spine for the AI Coach.
 *
 * Same control as identity `/internal/rank`: HMAC service headers, no user
 * principal. tRPC `curriculum` is academy:read and would require a caller
 * identity svc-agents does not hold.
 *
 * Bytes are retained so a v2 digest can be checked against the empty GET body.
 */

import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_SERVICE_BODY_BIND_MODE,
  rawBodyOf,
  retainRawBody,
  verifyServiceHeaders,
  type ServiceBodyBindMode,
} from '@intafaced/contracts';
import { coachSpinePayload } from './coach-spine.js';

export function registerInternalCurriculumRoute(
  app: FastifyInstance,
  internalSecret: string,
  bodyBind: ServiceBodyBindMode = DEFAULT_SERVICE_BODY_BIND_MODE,
): void {
  retainRawBody(app);

  app.get('/internal/curriculum', async (req, reply) => {
    if (verifyServiceHeaders(req.headers, internalSecret, { rawBody: rawBodyOf(req), mode: bodyBind }).service === null) {
      return reply.code(401).send({ error: 'service credentials required', code: 'academy.unauthenticated' });
    }
    return coachSpinePayload();
  });
}
