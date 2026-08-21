/**
 * Merchant agent product policy — money-write denylist + live metrics Class X.
 */
import { MERCHANT_MONEY_WRITE_TOOLS, merchantAgentGuardrail } from './guardrail.js';

export type MerchantPolicySummary = {
  readonly agentId: string;
  readonly guardrailVersion: number;
  readonly declaredTools: readonly string[];
  readonly moneyWriteTools: readonly string[];
  readonly liveMetricsRequired: true;
  readonly liveMetricsRefuseReason: 'no_live_metrics';
  readonly darkPayPlaneRefuseReason: 'pay_plane_dark';
  readonly inventsApprovalRate: false;
};

export function describeMerchantPolicy(): MerchantPolicySummary {
  const guardrail = merchantAgentGuardrail();
  return {
    agentId: guardrail.agentId,
    guardrailVersion: guardrail.version,
    declaredTools: guardrail.tools.map((t) => t.name),
    moneyWriteTools: MERCHANT_MONEY_WRITE_TOOLS,
    liveMetricsRequired: true,
    liveMetricsRefuseReason: 'no_live_metrics',
    darkPayPlaneRefuseReason: 'pay_plane_dark',
    inventsApprovalRate: false,
  };
}
