/**
 * Internal funding-rate publish (trade.futures residual).
 *
 * S2S only — oracle/ops publish rates here. Never invents a rate on GET;
 * public surface only reflects what was published.
 */
import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import { periodIdFor, type FundingRateEntry } from './funding-rate-source.js';
import { assertFundingRateWithinBound, FundingRateBoundError } from './funding-rate-bound.js';

/** Clock-skew allowance on a publisher's `asOfMs`. Anything beyond is refused. */
const FUTURE_SKEW_MS = 60_000;

export interface InternalFundingRateDeps {
  internalSecret: string;
  publishFundingRate: (entry: FundingRateEntry) => void;
  /**
   * Absolute max |rate| (TRADE_FUTURES_FUNDING_MAX_ABS_RATE).
   * Null = unconfigured → refuse publish (fail-closed; no invented ceiling).
   */
  maxAbsRate: string | null;
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

    // Magnitude bound BEFORE the rate book accepts anything. An absurd rate
    // ("1000000") must never become the published quote a tick settles against.
    // Unset max is refuse, not invent (owner residual D2).
    try {
      assertFundingRateWithinBound(rate, deps.maxAbsRate);
    } catch (err) {
      if (err instanceof FundingRateBoundError) {
        return reply.code(400).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    const nowMs = (deps.now ?? Date.now)();
    const asOfMs = req.body?.asOfMs ?? nowMs;
    if (!Number.isFinite(asOfMs) || asOfMs < 0) {
      return reply.code(400).send({ error: 'trade.funding_rate_publish_invalid', message: 'asOfMs invalid' });
    }
    // A future `asOfMs` is not a harmless oddity. `isRateFresh` requires
    // `now >= asOf`, so one publish stamped past the horizon makes `quote()`
    // return null for that market FOREVER — funding silently stops being
    // collected and the tick only writes skip rows. The same value makes
    // `new Date(asOfMs).toISOString()` throw, which the public
    // `GET /api/v1/funding-rate/:symbol` handler does not catch, so that
    // symbol 500s permanently too. One clock-skew allowance, then refuse.
    if (asOfMs > nowMs + FUTURE_SKEW_MS) {
      return reply.code(400).send({
        error: 'trade.funding_rate_publish_invalid',
        message:
          'asOfMs is in the future — a rate cannot be observed before it exists, and a future stamp silently stops funding for this market',
      });
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
    //
    // WHAT THIS DOES NOT DO, stated plainly so the next reader does not see a
    // fixed file: requiring a name BOUNDS NOTHING BY ITSELF. A publisher that
    // sends `periodStartIso: new Date().toISOString()` on every poll gets a
    // fresh period every poll and the original over-charge, and that is the
    // most obvious way an author satisfies a new required field. What the
    // checks below buy is a smaller surface — the id must be a real instant,
    // canonicalised, and scoped to its own market — which takes it from "any
    // string" to "any valid instant". That is a reduction, not a bound.
    //
    // The bound is the ANCHOR: rejecting an instant that is not on the market's
    // funding boundary. That boundary is exactly the product fact this refuses
    // to invent, so it has to arrive as per-market config, not as a constant
    // here. Until it does, this endpoint trusts its publisher on cadence.
    const rawPeriodId = req.body?.periodId?.trim();
    const rawStartIso = req.body?.periodStartIso?.trim();
    if (!rawPeriodId && !rawStartIso) {
      return reply.code(400).send({
        error: 'trade.funding_rate_publish_invalid',
        message:
          'periodId or periodStartIso is required — a funding period is a product fact and is never derived from the clock. ' +
          'A publisher that does not name its period cannot be settled idempotently, and every republish would charge a full period again.',
      });
    }

    let periodId: string;
    if (rawPeriodId) {
      // A supplied id must belong to the market it is published for.
      // `funding_periods` is keyed on `period_id` ALONE, so one id copy-pasted
      // across two markets means the second market's period reads as already
      // settled and its longs and shorts never exchange collateral — no error,
      // no log. `markSettled` also infers `market_id` by slicing to the first
      // colon, so an id without this prefix writes a garbage attribution.
      if (rawPeriodId !== marketId && !rawPeriodId.startsWith(`${marketId}:`)) {
        return reply.code(400).send({
          error: 'trade.funding_rate_publish_invalid',
          message: `periodId must be scoped to its market — expected it to start with "${marketId}:"`,
        });
      }
      periodId = rawPeriodId;
    } else {
      // Canonicalise the instant before it becomes an identity.
      //
      // `periodIdFor` is a bare concat, so `...T22:13:20.000Z`,
      // `...T22:13:20Z` and `...T00:13:20+02:00` are the SAME moment and three
      // different chargeable periods. An oracle that changes its date library —
      // or a second publisher with a different one — double-charges without
      // anyone changing a period.
      const parsed = Date.parse(rawStartIso!);
      if (!Number.isFinite(parsed)) {
        return reply.code(400).send({
          error: 'trade.funding_rate_publish_invalid',
          message: 'periodStartIso must be a valid ISO-8601 instant',
        });
      }
      periodId = periodIdFor(marketId, new Date(parsed).toISOString());
    }

    const entry: FundingRateEntry = { marketId, rate, periodId, asOfMs };
    deps.publishFundingRate(entry);
    return reply.code(200).send({ ok: true, marketId, periodId, rate, asOfMs });
  });
}
