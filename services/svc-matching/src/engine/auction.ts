/**
 * Auction / benchmark through matching.
 * Unsupported intent refuses rather than becoming a limit.
 * Missing or false is a normal order. The engine does not invent an auction price.
 */

export const AUCTION_UNSUPPORTED = 'auction_unsupported' as const;
export const BENCHMARK_UNSUPPORTED = 'benchmark_unsupported' as const;

export type AuctionRefuse = typeof AUCTION_UNSUPPORTED | typeof BENCHMARK_UNSUPPORTED;

export function readAuction(order: { readonly auction?: boolean | null }): boolean {
  return order.auction === true;
}

export function readBenchmark(order: { readonly benchmark?: boolean | null }): boolean {
  return order.benchmark === true;
}

export function auctionRefuse(auction: boolean): { readonly code: typeof AUCTION_UNSUPPORTED; readonly message: string } | null {
  if (!auction) return null;
  return {
    code: AUCTION_UNSUPPORTED,
    message: 'auction orders are unsupported; the engine does not invent an auction price',
  };
}

export function benchmarkRefuse(benchmark: boolean): { readonly code: typeof BENCHMARK_UNSUPPORTED; readonly message: string } | null {
  if (!benchmark) return null;
  return {
    code: BENCHMARK_UNSUPPORTED,
    message: 'benchmark orders are unsupported; the engine does not invent a benchmark price',
  };
}

export function auctionIntentRefuse(order: {
  readonly auction?: boolean | null;
  readonly benchmark?: boolean | null;
}): { readonly code: AuctionRefuse; readonly message: string } | null {
  return auctionRefuse(readAuction(order)) ?? benchmarkRefuse(readBenchmark(order));
}
