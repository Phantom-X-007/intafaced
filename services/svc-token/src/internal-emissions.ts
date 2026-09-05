/**
 * POST /internal/emissions/mint-next — cron / S2S mint of the next epoch.
 *
 * Prefer this over the in-process auto-tick: a cron is pauseable, inspectable,
 * and does not depend on which replica holds the timer.
 *
 * ── WHY THIS LIVES IN ITS OWN MODULE ────────────────────────────────────────
 *
 * Same reason as `internal-stake.ts`: `index.ts` connects Postgres and NATS and
 * calls `app.listen()` at module scope, so it cannot be imported by a test. The
 * kill-switch path (`EMISSIONS_ENABLED=false` → 503, zero mint) had no unit
 * proof at the HTTP boundary even though tRPC mintEpoch was covered.
 *
 * Money on the wire is `formatAmount` — never `Amount.toString()` (see #1100).
 */
import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { authorizeTokenJobHttp } from './job-hmac.js';

export interface InternalEmissionsDeps {
  readonly internalSecret: string;
  /** When false every mint path fails closed — inflation cannot be un-minted. */
  readonly emissionsEnabled: boolean;
  readonly mintNextEpoch: () => Promise<{ epoch: number; minted: Amount }>;
}

export function registerInternalEmissions(app: FastifyInstance, deps: InternalEmissionsDeps): void {
  app.post('/internal/emissions/mint-next', async (req, reply) => {
    const auth = authorizeTokenJobHttp(verifyServiceHeaders(req.headers, deps.internalSecret).service);
    if (!auth.ok) {
      return reply.code(auth.status).send({ error: auth.error, code: auth.code });
    }
    if (!deps.emissionsEnabled) {
      return reply.code(503).send({ error: 'emissions are disabled', code: 'token.emissions_disabled' });
    }
    try {
      const result = await deps.mintNextEpoch();
      return { epoch: result.epoch, minted: formatAmount(result.minted) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'mint failed';
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'token.mint_failed';
      // Fail closed: never 200 on a mint that did not land.
      return reply.code(400).send({ error: message, code });
    }
  });
}
