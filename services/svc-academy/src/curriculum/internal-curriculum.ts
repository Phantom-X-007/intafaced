/**
 * GET /internal/curriculum — service-to-service spine for the AI Coach.
 *
 * Same control as identity `/internal/rank`: HMAC service headers, no user
 * principal. tRPC `curriculum` is academy:read and would require a caller
 * identity svc-agents does not hold.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import { coachSpinePayload } from './coach-spine.js';

export function registerInternalCurriculumRoute(app: FastifyInstance, internalSecret: string): void {
  app.get('/internal/curriculum', async (req, reply) => {
    if (verifyServiceHeaders(req.headers, internalSecret).service === null) {
      return reply.code(401).send({ error: 'service credentials required', code: 'academy.unauthenticated' });
    }
    return coachSpinePayload();
  });
}
