/**
 * In-process strategy book. svc-quant has no DATABASE_URL and posts no ledger
 * rows — this is not a second money book. Paper strategies live for the process.
 */

export interface StudioRiskBlock {
  readonly maxDrawdown: string;
  readonly maxNotional: string;
  readonly kill: string;
}

export interface StudioBlock {
  readonly side: 'buy' | 'sell';
  readonly symbol: string;
  readonly qty: string;
}

export interface SavedStrategy {
  readonly id: string;
  readonly name: string;
  readonly language: 'javascript';
  readonly source: string;
  readonly cash: string;
  readonly blocks: StudioBlock[];
  readonly risk: StudioRiskBlock;
  readonly environment: 'paper' | 'backtest' | 'shadow';
  readonly kind: 'paper' | 'simulated';
  readonly claimLabel: 'Paper — not live performance' | 'Historical simulation — not a forecast' | 'Shadow — not live performance';
  readonly live: false;
  readonly simulated: true;
}

export interface StudioStore {
  save(strategy: SavedStrategy): SavedStrategy;
  get(id: string): SavedStrategy | undefined;
  list(): readonly SavedStrategy[];
}

export function createStudioStore(): StudioStore {
  const byId = new Map<string, SavedStrategy>();
  return {
    save(strategy) {
      byId.set(strategy.id, strategy);
      return strategy;
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return [...byId.values()];
    },
  };
}
