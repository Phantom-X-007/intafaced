/**
 * GET /internal/api-keys/:keyId — S2S ownership snapshot for WS/edge live-check.
 * Extra bind lists ride on the JSON (contract schema stays {id,userId,revoked}).
 * No permission scopes flatten.
 */
import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import type { PlaceDoor } from './place-door.js';

export const API_KEY_OWNERSHIP_PATH = '/internal/api-keys' as const;

export function registerApiKeyOwnershipRoute(
  app: FastifyInstance,
  opts: { door: Pick<PlaceDoor, 'getApiKeyOwnership'>; internalSecret: string },
): void {
  app.get<{ Params: { keyId: string } }>(`${API_KEY_OWNERSHIP_PATH}/:keyId`, async (req, reply) => {
    if (verifyServiceHeaders(req.headers, opts.internalSecret).service === null) {
      return reply.code(401).send({ error: 'service credentials required', code: 'identity.unauthenticated' });
    }
    const row = await opts.door.getApiKeyOwnership(req.params.keyId);
    if (!row) {
      return reply.code(404).send({ error: 'API key not found', code: 'identity.api_key_not_found' });
    }
    return row;
  });
}
