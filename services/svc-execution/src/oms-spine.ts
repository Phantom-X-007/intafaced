/**
 * §28 execution spine — OMS / SOR / arb / MM door catalog (D26-P1-X3–X5).
 *
 * Static mount honesty only — does not invent routes or submit trades.
 */
export type ExecutionSpineDoor = {
  readonly id: string;
  readonly module: 'execution.sor' | 'execution.arbitrage' | 'execution.market-making' | 'execution.house-tenant';
  readonly kind: 'plan' | 'execute' | 'observe' | 'scan' | 'quote' | 'hedge' | 'admin';
  /** Spine doors never invent quotes, spreads, or mids. */
  readonly inventsQuotes: false;
  /** Catalog entry only — execute uses caller-injected venue submit maps. */
  readonly callerSubmit: boolean;
};

export const EXECUTION_SPINE_DOORS: readonly ExecutionSpineDoor[] = [
  { id: 'execution.oms.plan', module: 'execution.sor', kind: 'plan', inventsQuotes: false, callerSubmit: false },
  { id: 'execution.oms.execute', module: 'execution.sor', kind: 'execute', inventsQuotes: false, callerSubmit: true },
  { id: 'execution.arb.scan', module: 'execution.arbitrage', kind: 'scan', inventsQuotes: false, callerSubmit: false },
  { id: 'execution.mm.quote', module: 'execution.market-making', kind: 'quote', inventsQuotes: false, callerSubmit: false },
  { id: 'execution.mm.hedge', module: 'execution.market-making', kind: 'hedge', inventsQuotes: false, callerSubmit: false },
  { id: 'execution.tenant.describe', module: 'execution.house-tenant', kind: 'admin', inventsQuotes: false, callerSubmit: false },
];

export type ExecutionSpineSummary = {
  readonly doors: readonly ExecutionSpineDoor[];
  readonly sorUsesVenueAdapterPlanRoute: true;
  readonly externalOnly: true;
  readonly houseInternalRefuse: true;
};

/** Catalog of wired tRPC doors on svc-execution. */
export function describeExecutionSpine(): ExecutionSpineSummary {
  return {
    doors: EXECUTION_SPINE_DOORS,
    sorUsesVenueAdapterPlanRoute: true,
    externalOnly: true,
    houseInternalRefuse: true,
  };
}
