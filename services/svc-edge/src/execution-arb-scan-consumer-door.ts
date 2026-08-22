/**
 * execution.arbitrage scan consumer door on svc-edge (D26-P1-X4).
 *
 * Ships a named HTTP surface that documents the execution.arb.scan consumer mount.
 * Scan execution remains on svc-execution via /api/execution — this door refuses
 * partial wiring rather than inventing opportunities.
 */
import type { FastifyInstance } from 'fastify';

export const EXECUTION_ARB_SCAN_CONSUMER_PATH = '/execution/arb/scan-consumer' as const;

export function describeExecutionArbScanConsumerDoor() {
  return {
    path: EXECUTION_ARB_SCAN_CONSUMER_PATH,
    upstreamTrpc: '/api/execution/trpc/execution.arb.scan',
    externalOnlyV1: true as const,
    inventsQuotes: false as const,
  };
}

export function registerExecutionArbScanConsumerRoutes(app: FastifyInstance): void {
  app.get(EXECUTION_ARB_SCAN_CONSUMER_PATH, async () => describeExecutionArbScanConsumerDoor());
}
