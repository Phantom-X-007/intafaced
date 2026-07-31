/**
 * Internal funding-rate publish (trade.futures residual).
 *
 * S2S only — oracle/ops publish rates here. Never invents a rate on GET;
 * public surface only reflects what was published.
 */
import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import { periodIdFor, type FundingRateEntry } from './funding-rate-source.js';

export interface InternalFundingRateDeps {
  internalSecret: string;
  publishFundingRate: (entry: FundingRateEntry) => void;
  /** Optional clock for asOf default. */
  now?: () => number;
}

/**
 * POST /internal/futures/funding-rate
 * Body: { marketId, rate, periodId?, asOfMs? }
 * Auth: service headers (INTERNAL_SERVICE_SECRET).
 */
export function registerInternalFundingRate(app: FastifyInstance, deps: InternalFundingRateDeps): void {
  app.post<{
    Body: {
      marketId?: string;
      rate?: string;
      periodId?: string;
      asOfMs?: number;
      periodStartIso?: string;
    };
  }>('/internal/futures/funding-rate', async (req, reply) => {
    if (verifyServiceHeaders(req.headers, deps.internalSecret).service === null) {
      return reply.code(401).send({ error: 'unauthorized', message: 'service auth required' });
    }

    const marketId = req.body?.marketId?.trim();
    const rate = req.body?.rate?.trim();
    if (!marketId || !rate) {
      return reply.code(400).send({
        error: 'trade.funding_rate_publish_invalid',
        message: 'marketId and rate are required (never invent either)',
      });
    }
    if (!/^-?\d+(\.\d+)?$/.test(rate)) {
      return reply.code(400).send({
        error: 'trade.funding_rate_publish_invalid',
        message: 'rate must be a decimal string',
      });
    }

    const asOfMs = req.body?.asOfMs ?? (deps.now ?? Date.now)();
    if (!Number.isFinite(asOfMs) || asOfMs < 0) {
      return reply.code(400).send({ error: 'trade.funding_rate_publish_invalid', message: 'asOfMs invalid' });
    }

    let periodId = req.body?.periodId?.trim();
    if (!periodId) {
      const start = req.body?.periodStartIso?.trim() || new Date(asOfMs).toISOString();
      periodId = periodIdFor(marketId, start);
    }

    const entry: FundingRateEntry = { marketId, rate, periodId, asOfMs };
    deps.publishFundingRate(entry);
    return reply.code(200).send({ ok: true, marketId, periodId, rate, asOfMs });
  });
}
