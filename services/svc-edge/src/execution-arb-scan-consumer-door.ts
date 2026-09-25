/**
 * execution.arbitrage scan consumer door on svc-edge (D26-P1-X4).
 *
 * Ships a named HTTP surface that documents the execution.arb.scan consumer mount.
 * Scan execution remains on svc-execution via /api/execution — this door refuses
 * partial wiring rather than inventing opportunities.
 */
import { AuthError } from '@intafaced/auth';
import type { FastifyInstance } from 'fastify';
import { statusForAuthError } from './admin-api.js';

export const EXECUTION_ARB_SCAN_CONSUMER_PATH = '/execution/arb/scan-consumer' as const;

export function describeExecutionArbScanConsumerDoor() {
  return {
    path: EXECUTION_ARB_SCAN_CONSUMER_PATH,
    upstreamTrpc: '/api/execution/trpc/execution.arb.scan',
    externalOnlyV1: true as const,
    inventsQuotes: false as const,
  };
}

export function registerExecutionArbScanConsumerRoutes(
  app: FastifyInstance,
  authenticate: (header: string | undefined) => Promise<unknown>,
): void {
  app.get(EXECUTION_ARB_SCAN_CONSUMER_PATH, async (request, reply) => {
    try {
      await authenticate(request.headers.authorization);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(statusForAuthError(err)).send({ error: err.message, code: err.code });
      }
      throw err;
    }
    return describeExecutionArbScanConsumerDoor();
  });
}
