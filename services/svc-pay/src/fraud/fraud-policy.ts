/**
 * pay.fraud product policy — scoring mechanism honesty (D26-P1-P5).
 *
 * Pure mechanism: no invented scores, blocklist content, or chargeback ledger wire.
 */
export const FRAUD_RULE_IDS = ['velocity_count', 'velocity_volume', 'amount_anomaly', 'blocklist_ip', 'blocklist_device'] as const;

export type FraudPolicySummary = ReturnType<typeof describeFraudPolicy>;

/** Public honesty board for pay.fraud — mechanism only, list content Class X. */
export function describeFraudPolicy() {
  return {
    ruleIds: FRAUD_RULE_IDS,
    inventsRiskScores: false as const,
    inventsBlocklistContent: false as const,
    chargebackLedgerRefuseClosed: true as const,
    sanctionsSeparateFromFraud: true as const,
    silentAllowForbidden: true as const,
    explainableDecisions: true as const,
  };
}
