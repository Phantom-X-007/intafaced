/**
 * Unit card — tRPC markets.list limit unset refuse (no invented 50)
 *
 * 1. Promise: markets.list without limit does not dump trade.markets.
 *    Owner may pass 50.
 * 2. Break: publicProcedure with no input called TradeService.markets() unbounded.
 * 3. Done bar: zod requires 1..500; explicit 50 reaches TradeService.markets(50).
 * 4. Class N
 * 5. Paths: router.ts markets.list
 * 6. RED: omitting limit returns every listed market
 */
import { describe, expect, it } from 'vitest';
import { createTradeRouter } from './router.js';
import type { TradeService } from './spot/trade-service.js';

describe('tRPC markets.list limit unset refuse (no invented 50)', () => {
  it('required limit; owner-explicit 50 reaches TradeService.markets', async () => {
    const seen: number[] = [];
    const trade = {
      markets: async (limit: number) => {
        seen.push(limit);
        return [];
      },
    } as unknown as TradeService;
    const caller = createTradeRouter(trade).createCaller({} as never);
    await expect(caller.markets.list(undefined as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(seen).toEqual([]);
    await expect(caller.markets.list({ limit: 50 })).resolves.toEqual([]);
    expect(seen).toEqual([50]);
  });
});
