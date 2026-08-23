import type { FastifyInstance } from 'fastify';
import type { FundingRateEntry } from './funding-rate-source.js';
import type { FuturesMarkProvenance } from './mark-policy.js';

interface FuturesTickerMarket {
  readonly id: string;
  readonly symbol: string;
  readonly kind: string;
}

export interface FuturesTickerRestDeps {
  marketBySymbol(symbol: string): Promise<FuturesTickerMarket | null>;
  markForMarket(marketId: string, symbol: string): Promise<{ price: string; source: FuturesMarkProvenance } | null>;
  fundingForMarket(marketId: string): FundingRateEntry | null;
}

/** Public futures strip. Missing market facts stay null; this route never synthesises ticks or cadence. */
export function registerFuturesTickerRest(app: FastifyInstance, deps: FuturesTickerRestDeps): void {
  app.get<{ Querystring: { symbol?: string } }>('/api/v1/futures/ticker', async (req, reply) => {
    const symbol = req.query.symbol?.trim();
    if (!symbol) {
      return reply.code(400).send({ error: 'trade.futures_ticker_symbol_required', message: 'symbol is required' });
    }

    const market = await deps.marketBySymbol(symbol);
    if (!market) {
      return reply.code(404).send({ error: 'trade.futures_ticker_market_unknown', message: `unknown market ${symbol}` });
    }
    if (market.kind !== 'futures') {
      return reply.code(400).send({ error: 'trade.futures_ticker_spot_market', message: `${market.symbol} is not a futures market` });
    }

    const [mark, funding] = await Promise.all([
      deps.markForMarket(market.id, market.symbol),
      Promise.resolve(deps.fundingForMarket(market.id)),
    ]);

    return reply.code(200).send({
      markPrice: mark?.price ?? null,
      markSource: mark?.source ?? null,
      fundingRate: funding?.rate ?? null,
      fundingPeriodId: funding?.periodId ?? null,
      nextFundingTime: funding?.periodEndIso ?? null,
    });
  });
}
