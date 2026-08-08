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

    // The period must be NAMED by the publisher. It is never derived from the
    // clock, and that is the same "never invent" rule as the rate itself.
    //
    // A funding period is a product fact — a window with a start, a length and
    // an anchor — and its identity is the only thing standing between a trader
    // and repeat settlement: `runFundingTick` skips a period it has already
    // settled, and it does so by id. Deriving that id from `asOfMs` defeated it
    // completely, because `toISOString()` is MILLISECOND resolution. An oracle
    // republishing the same rate every 60s minted a brand-new unsettled period
    // on every publish, so every trader was charged a full period again on
    // every tick. No crash required — that is ordinary polling behaviour.
    //
    // Bucketing the clock to 8h would swap one invention for another: doctrine
    // says funding is every 8h but names no anchor, so the service would be
    // choosing where the boundary falls. Refusing is the honest answer.
    const periodStartIso = req.body?.periodStartIso?.trim();
    const periodId = req.body?.periodId?.trim() || (periodStartIso ? periodIdFor(marketId, periodStartIso) : '');
    if (!periodId) {
      return reply.code(400).send({
        error: 'trade.funding_rate_publish_invalid',
        message:
          'periodId or periodStartIso is required — a funding period is a product fact and is never derived from the clock. ' +
          'A publisher that does not name its period cannot be settled idempotently, and every republish would charge a full period again.',
      });
    }

    const entry: FundingRateEntry = { marketId, rate, periodId, asOfMs };
    deps.publishFundingRate(entry);
    return reply.code(200).send({ ok: true, marketId, periodId, rate, asOfMs });
  });
}
