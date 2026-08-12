/**
 * D26-P1-A6 — Agent metering product law (sealed).
 *
 * Done bar: metering-off = audit-only forever proven; no silent feeCharge.
 *
 * When `AGENTS_METERING_ENABLED` / `meteringEnabled` is false:
 *   · Token counts stay on the action audit only (knowable cost).
 *   · Never write `usage_records` or open new usage windows.
 *   · Never post `feeCharge` — including settle of leftover windows and
 *     `settleSession` / session.close / admin settle routes (all go through
 *     `AgentRuntime.settleWindow`).
 *   · Never invent `request_id_replay` as if a charge existed.
 *
 * Dual-write of `usage_records` while metering is off is FORBIDDEN. This file
 * is the product ruling — not a residual awaiting a later flip.
 *
 * Deliberately imports nothing from `meter.ts` so the seal suite can pin this
 * law without loading the ledger/db graph.
 */
export const METERING_OFF_PRODUCT_LAW = {
  id: 'D26-P1-A6',
  mode: 'audit_only',
  /** Forever: metering-off does not dual-write billable usage rows. */
  allowsUsageRecords: false,
  /** Forever: metering-off never posts ledger feeCharge. */
  allowsFeeCharge: false,
  /** Forever: metering-off does not refuse on request-id replay. */
  allowsRequestIdReplayRefuse: false,
} as const;

export type MeteringOffProductLaw = typeof METERING_OFF_PRODUCT_LAW;

/** Same key shape as `chargeKeyFor` in meter.ts — kept local to avoid meter import. */
function chargeKeyFor(sessionId: string, windowId: string): string {
  return `agent.usage:${sessionId}:${windowId}`;
}

/**
 * Settlement stub returned while metering is off.
 *
 * Centralises the D26-P1-A6 money-path refuse so `settleWindow` cannot silently
 * fall through to `UsageMeter.settle` → `recipes.feeCharge`.
 */
export function meteringOffSettlementStub(
  sessionId: string,
  windowId: string,
): {
  readonly sessionId: string;
  readonly windowId: string;
  readonly chargeKey: string;
  readonly amount: bigint;
  readonly chargeTxId: null;
  readonly settled: false;
} {
  if (METERING_OFF_PRODUCT_LAW.allowsFeeCharge) {
    throw new Error(`${METERING_OFF_PRODUCT_LAW.id}: product law must forbid feeCharge while metering off`);
  }
  return {
    sessionId,
    windowId,
    chargeKey: chargeKeyFor(sessionId, windowId),
    amount: 0n,
    chargeTxId: null,
    settled: false,
  };
}

/** Think-path meter gate: both session.metered and process kill-switch. */
export function shouldMeterUsage(sessionMetered: boolean, meteringEnabled: boolean): boolean {
  return sessionMetered && meteringEnabled;
}
