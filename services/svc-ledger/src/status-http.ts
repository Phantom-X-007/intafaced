import type { FastifyInstance } from 'fastify';

/**
 * Liveness vs readiness — the freeze must be visible on the port, not only
 * inside `index.ts` handlers that no unit can import without booting Postgres.
 *
 * `/health` stays 200 while frozen (the process is alive). `/ready` returns 503
 * so a frozen replica leaves the load-balancer rotation instead of answering
 * every post with 412 one by one.
 */
export interface LedgerStatusPort {
  status(): Promise<{ postingEnabled: boolean; frozenReason: string | null; frozenBy: string | null }>;
}

export function registerLedgerStatusHttp(app: FastifyInstance, ledger: LedgerStatusPort, serviceName: string): void {
  app.get('/health', async () => ({ ok: true, service: serviceName, ...(await ledger.status()) }));

  app.get('/ready', async (_req, reply) => {
    const status = await ledger.status();
    if (!status.postingEnabled) return reply.code(503).send({ ready: false, reason: status.frozenReason });
    return { ready: true };
  });
}
