/**
 * Merchant product policy door — money-write denylist + watch refuse catalog.
 *
 * No live metrics port, no approval-rate board. Integrators read this before wiring UI.
 */
import { MERCHANT_MONEY_WRITE_TOOLS } from './guardrail.js';
import { merchantMoneyDenyBoardCard, merchantMoneyDenyStatusLine, merchantWatchRefuseBoardCard } from './guardrail-honesty.js';
import { MERCHANT_WATCH_REFUSE } from './watch.js';

export type MerchantPolicySummary = {
  readonly moneyWriteTools: string[];
  readonly moneyDeny: ReturnType<typeof merchantMoneyDenyBoardCard>;
  readonly moneyDenyStatusLine: string;
  readonly moneyDenyExport: string;
  readonly watchRefuseReasons: string[];
  readonly watchRefuse: ReturnType<typeof merchantWatchRefuseBoardCard>;
  readonly liveMetricsRefuseReason: 'no_live_metrics';
  readonly darkPayPlaneRefuseReason: 'pay_plane_dark';
  readonly inventsApprovalRate: false;
  readonly allowedTask: 'merchant.watch';
};

function merchantMoneyDenyExportText(): string {
  const c = merchantMoneyDenyBoardCard();
  return ['tools,ledger_post,pay_route_change', `${c.tools},${c.hasLedgerPost},${c.hasPayRouteChange}`].join('\n');
}

/** Static policy surface for merchant (D26-P1-A4 / guardrail law). */
export function describeMerchantPolicy(): MerchantPolicySummary {
  return {
    moneyWriteTools: [...MERCHANT_MONEY_WRITE_TOOLS],
    moneyDeny: merchantMoneyDenyBoardCard(),
    moneyDenyStatusLine: merchantMoneyDenyStatusLine(),
    moneyDenyExport: merchantMoneyDenyExportText(),
    watchRefuseReasons: [...Object.values(MERCHANT_WATCH_REFUSE)],
    watchRefuse: merchantWatchRefuseBoardCard(),
    liveMetricsRefuseReason: 'no_live_metrics',
    darkPayPlaneRefuseReason: 'pay_plane_dark',
    inventsApprovalRate: false,
    allowedTask: 'merchant.watch',
  };
}
