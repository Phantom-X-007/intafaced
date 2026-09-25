/**
 * execution.sor OMS consumer door on svc-edge (P-04).
 *
 * Documents the public OMS/EMS surface proxied to svc-execution. Does not
 * invent plans or parent/child orders — refuses partial wiring honestly.
 */
import { AuthError } from '@intafaced/auth';
import type { FastifyInstance } from 'fastify';
import { statusForAuthError } from './admin-api.js';

export const EXECUTION_OMS_CONSUMER_PATH = '/execution/oms/consumer' as const;

export function describeExecutionOmsConsumerDoor() {
  return {
    path: EXECUTION_OMS_CONSUMER_PATH,
    upstreamTrpcBase: '/api/execution/trpc',
    omsProcedures: [
      'execution.oms.plan',
      'execution.oms.execute',
      'execution.oms.cancel',
      'execution.oms.fetch',
      'execution.oms.ems.list',
      'execution.oms.ems.get',
      'execution.arb.executeLegs',
    ] as const,
    adminScoped: true as const,
    inventsParentChild: false as const,
    inventsQuotes: false as const,
  };
}

export function registerExecutionOmsConsumerRoutes(
  app: FastifyInstance,
  authenticate: (header: string | undefined) => Promise<unknown>,
): void {
  app.get(EXECUTION_OMS_CONSUMER_PATH, async (request, reply) => {
    try {
      await authenticate(request.headers.authorization);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(statusForAuthError(err)).send({ error: err.message, code: err.code });
      }
      throw err;
    }
    return describeExecutionOmsConsumerDoor();
  });
}
