/**
 * Lake port for event-level backtest. Missing lake is a named refuse — never
 * invented candles or mids. Injected; svc-quant still has no DATABASE_URL.
 */

export interface LakeFill {
  readonly ts: string;
  readonly symbol: string;
  readonly qty: string;
  readonly price: string;
}

export interface BacktestLakeQuery {
  readonly symbol: string;
  readonly from: string;
  readonly to: string;
}

export interface BacktestLake {
  readonly wired: boolean;
  fills(query: BacktestLakeQuery): readonly LakeFill[] | null;
}

export function missingLake(): BacktestLake {
  return {
    wired: false,
    fills: () => null,
  };
}
